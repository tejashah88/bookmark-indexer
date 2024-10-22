import deepClone from 'rfdc/default';
import { Readability } from '@mozilla/readability';
import { DOMParser } from 'linkedom';
import { enumerate } from 'pythonic';
import PromisePool from '@supercharge/promise-pool';

import type { BookmarkEntry, BookmarkDatabase, ScanBookmarksResults } from '~/src/interfaces/data-interfaces';
import ProgressTracker from '~/src/utils/ProgressTracker';


interface ParsedWebpageResult {
  processing: false | 'application/pdf';
  title: string;
  html: string;
}


// Utility method to asynchronously sleep for X milliseconds
export async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// Utility method to clean up scraped text from Mozilla's readability libary
export function sanitizeContent(text: string): string {
  return text
    .replaceAll('\\"', '"')
    .replaceAll("\\'", '"')
    .replaceAll('\\n', '  ')
    .replaceAll('\\t', '  ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}


// Service to manage text scraping from bookmark links
export default class BookmarkScrapeEngine {
  static #instance: BookmarkScrapeEngine;

  private readonly TEXT_SCRAPING_CONCURRENCY: number = 8;
  private readonly CHECKPOINT_ITEM_FREQ: number = 10;

  private constructor() {}

  public static get instance(): BookmarkScrapeEngine {
    if (!BookmarkScrapeEngine.#instance) {
      BookmarkScrapeEngine.#instance = new BookmarkScrapeEngine();
    }

    return BookmarkScrapeEngine.#instance;
  }


  // Recursively collect all bookmark links from a tree node, typically the root node
  _collectBookmarkLinks(node: chrome.bookmarks.BookmarkTreeNode, urls: string[]): void {
    if (node.children) {
      for (const subNode of node.children) {
        this._collectBookmarkLinks(subNode, urls);
      }
    } else {
      urls.push(node.url);
    }
  }


  // Parse the readable text content from an HTML string
  async _parseTextFromHtml(html: string) {
    const documentClone: any = new DOMParser().parseFromString(html, 'text/html');
    let parsedArticle;
    try {
      parsedArticle = new Readability(documentClone).parse();
    } catch (parseError) {
      console.warn(`Warning when trying to parse scraped text content via 'mozilla'`);
      console.warn(parseError);
    }

    if (!parsedArticle)
      return null;

    return {
      title: sanitizeContent(parsedArticle.title),
      content: sanitizeContent(parsedArticle.textContent),
    }
  }


  // Create a Chrome tab to render and subsequently fetch its text content
  async _createAndExecuteTab<Result>(url: string, initialDelay: number, timeout: number, executorFunc: () => Promise<Result>) {
    const tab: chrome.tabs.Tab = await chrome.tabs.create({
      url: url,
      active: false,
      index: 0,
      pinned: true
    });

    // Wait for page to intially load (this prevents immediate closing of tab for <20% of websites)
    await delay(initialDelay);

    // Set the tab to automatically close if it does not render by timeout (in ms)
    const autoCloseTabHandle = setTimeout(() => chrome.tabs.remove(tab.id), timeout);
    let scriptResult: Result | null;

    try {
      // Inject the 'executorFunc' into the page being rendered when it's ready. When page rendering,
      // injection and execution of injected function is completed, 'executeScript' will yield.
      const results = await chrome.scripting.executeScript<any, Promise<Result>>({
        injectImmediately: false,
        target: {
          allFrames: false,
          tabId: tab.id,
          frameIds: [0],
        },
        world: 'MAIN',
        func: executorFunc,
      });

      // If we finish the text extraction process early, close the tab early
      clearTimeout(autoCloseTabHandle);
      await chrome.tabs.remove(tab.id);

      scriptResult = results[0].result;
    } catch (error) {
      // Known errors:
      // - Frame with ID 0 was removed. => Can happen when tab was closed before content was properly loaded via timeout.
      console.warn(`Warning when trying to scrape text content from "${url}"`);
      console.warn(error);

      scriptResult = null;
    }

    return scriptResult;
  }


  // The actual executor function being injected to fetch the HTML content to be serialized.
  async _scrapeTextContent(url: string): Promise<BookmarkEntry | null> {
    let webpageContent = await this._createAndExecuteTab(url, 5_000, 15_000, async (): Promise<ParsedWebpageResult | null> => {
      // function delay(ms) {
      //   return new Promise(resolve => setTimeout(resolve, ms));
      // }

      if (document.contentType === 'application/pdf') {
        return {
          processing: 'application/pdf',
          title: null,
          html: null,
        }
      }

      // await delay(5_000);

      const serializer = new XMLSerializer();
      const text = serializer.serializeToString(document);

      return {
        processing: false,
        title: document.title,
        html: JSON.stringify(text),
      };
    });

    if (webpageContent?.processing && webpageContent.processing === 'application/pdf') {
      // NOTE: Google Drive's PDF viewer is limited to 25 MB and cannot scroll down programmatically
      const patchedUrl = `https://drive.google.com/viewerng/viewer?url=${url}`;

      webpageContent = await this._createAndExecuteTab(patchedUrl, 5_000, 15_000, async (): Promise<ParsedWebpageResult | null> => {
        // function delay(ms) {
        //   return new Promise(resolve => setTimeout(resolve, ms));
        // }

        // await delay(5_000);

        const serializer = new XMLSerializer();
        const text = serializer.serializeToString(document);

        return {
          processing: false,
          title: document.title,
          html: JSON.stringify(text),
        };
      });
    }

    if (!webpageContent)
      return null;

    const parsedArticle = await this._parseTextFromHtml(webpageContent.html);

    if (!parsedArticle)
      return null;

    return {
      url: url,
      title: webpageContent.title,
      content: sanitizeContent(parsedArticle.content),
    } satisfies BookmarkEntry;
  }


  // Long running task to scrape changed links or all links from scratch
  async scanBookmarkLinks(
    oldBookmarkMapping: BookmarkDatabase,
    forceRefresh: boolean,
    onProgressUpdate: (progress: number) => Promise<void>,
    onCheckpointSave: (mappingCheckpoint: BookmarkDatabase) => Promise<void>,
  ): Promise<ScanBookmarksResults> {
    // Collect new bookmark URLs recursively
    const newBookmarkURLs = [];
    const rootNodes: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.getTree();

    for (const subNode of rootNodes) {
      this._collectBookmarkLinks(subNode, newBookmarkURLs);
    }

    // Make copy of bookmark mapping since original one will be mutated
    const bookmarkMappingCopy = deepClone(oldBookmarkMapping);
    // If force refresh is false, calculate change list based from existing bookmarks list
    // Otherwise assume that no old bookmark links exist
    const oldBookmarkURLs: string[] = forceRefresh ? [] : Object.keys(bookmarkMappingCopy);

    // Create set objects for old and new URLs
    const oldUrlSet = new Set(oldBookmarkURLs);
    const newUrlSet = new Set(newBookmarkURLs);

    // Calculate links to be added and removed (thanks to set theory)
    const linksAdded = newUrlSet.difference(oldUrlSet);
    const linksRemoved = oldUrlSet.difference(newUrlSet);

    // Create a progress tracker object for the popup progress bar
    // Links removed has update weight of 10% and links added has update weight of 90% due to computation effort
    const progressTracker = new ProgressTracker(2, [0.1, 0.9]);
    const doProgressUpdate = async ({ removeProgress, addProgress }: { removeProgress: number, addProgress: number }) => {
      const progressValues: number[] = [removeProgress, addProgress];
      await onProgressUpdate(progressTracker.updateProgress(progressValues));
    }

    // Reset progress to 0% overall
    await doProgressUpdate({
      addProgress: 0.0,
      removeProgress: 0.0,
    });

    console.debug(`Links to add: ${linksAdded.size}`);
    console.debug(`Links to remove: ${linksRemoved.size}`);

    const newBookmarkContentMapping = {};

    // Remove links that have been removed by user
    for (const [linkIndex, linkToRemove] of enumerate(linksRemoved)) {
      delete bookmarkMappingCopy[linkToRemove];
      await doProgressUpdate({
        addProgress: 0.0,
        removeProgress: (linkIndex + 1) / linksRemoved.size,
      });
    }

    // Set progress to 10% overall
    await doProgressUpdate({
      addProgress: 0.0,
      removeProgress: 1.0,
    });


    let itemsProcessed = 0;
    let self = this;
    async function scrapeTextFromLink(link: string): Promise<BookmarkEntry | null> {
      // Bookmarklets are to be skipped
      if (link.startsWith('javascript:'))
        return null;

      console.log(`Processing ${link}...`);
      const entry = await self._scrapeTextContent(link);

      // If text scraping from given link was successful, save the results
      if (!!entry) {
        newBookmarkContentMapping[entry.url] = entry;
        bookmarkMappingCopy[entry.url] = entry;
      }

      itemsProcessed += 1;
      // Do a progress update for every new link processed (successfully or not)
      await doProgressUpdate({
        addProgress: (itemsProcessed + 1) / linksAdded.size,
        removeProgress: 1.0,
      });

      // Only emit a checkpoint database save every 'CHECKPOINT_ITEM_FREQ' times
      if (itemsProcessed % this.CHECKPOINT_ITEM_FREQ === 0) {
        await onCheckpointSave(bookmarkMappingCopy);
      }

      return entry;
    }

    // Fetch content for new links to add. This is done via a promise worker pool and concurrency
    // set to 'TEXT_SCRAPING_CONCURRENCY' to ensure no single task halts the task queue.
    await PromisePool
      .for([...linksAdded])
      .withConcurrency(this.TEXT_SCRAPING_CONCURRENCY)
      // NOTE: This is probably not needed, but doesn't hurt to have it for now...
      .useCorrespondingResults()
      .process(async (item, index, pool) => {
        return await scrapeTextFromLink(item);
      });


    // Set progress to 100% overall
    await doProgressUpdate({
      addProgress: 1.0,
      removeProgress: 1.0,
    });

    return {
      newData: bookmarkMappingCopy,
      bookmarksAdded: {
        keys: [...linksAdded],
        content: newBookmarkContentMapping,
      },
      bookmarksRemoved: {
        keys: [...linksRemoved],
      }
    };
  }
}

