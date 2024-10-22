import deepClone from 'rfdc/default';
import { Readability } from '@mozilla/readability';
import { DOMParser } from 'linkedom';
import { enumerate } from 'pythonic';

import type { BookmarkEntry, BookmarkDatabase, ScanBookmarksResults } from '~/src/interfaces/data-interfaces';
import ProgressTracker from '~/src/utils/ProgressTracker';
import { sanitizeContent } from '~/src/utils/string';
import { delay } from '~/src/utils/promises';

import PromisePool from '@supercharge/promise-pool';


interface ParsedWebpageResult {
  processing: false | 'application/pdf';
  title: string;
  html: string;
}


export default class BookmarkScrapeEngine {
  static #instance: BookmarkScrapeEngine;

  private constructor() {}

  public static get instance(): BookmarkScrapeEngine {
    if (!BookmarkScrapeEngine.#instance) {
      BookmarkScrapeEngine.#instance = new BookmarkScrapeEngine();
    }

    return BookmarkScrapeEngine.#instance;
  }


  _collectBookmarkLinks(node: chrome.bookmarks.BookmarkTreeNode, urls: string[]): void {
    if (node.children) {
      for (const subNode of node.children) {
        this._collectBookmarkLinks(subNode, urls);
      }
    } else {
      urls.push(node.url);
    }
  }


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


  async _createAndExecuteTab<Result>(url: string, initialDelay: number, timeout: number, executorFunc: () => Promise<Result>) {
    const tab: chrome.tabs.Tab = await chrome.tabs.create({
      url: url,
      active: false,
      index: 0,
      pinned: true
    });

    // Wait for page to intially load (this prevents immediate closing of tab for <20% of websites)
    await delay(initialDelay);

    const autoCloseTabHandle = setTimeout(() => chrome.tabs.remove(tab.id), timeout);
    let scriptResult: Result | null;

    try {
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


  async scanBookmarkLinks(
    oldBookmarkMapping: BookmarkDatabase,
    forceRefresh: boolean,
    onProgressUpdate: (progress: number) => Promise<void>,
    onCheckpointSave: (mappingCheckpoint: BookmarkDatabase) => Promise<void>,
  ): Promise<ScanBookmarksResults> {
    // Collect new bookmark URLs
    const newBookmarkURLs = [];
    const rootNodes: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.getTree();

    for (const subNode of rootNodes) {
      this._collectBookmarkLinks(subNode, newBookmarkURLs);
    }

    const bookmarkMappingCopy = deepClone(oldBookmarkMapping);
    // If force refresh is false, calculate change list based from existing bookmarks list
    // Otherwise assume that no old bookmark links exist
    const oldBookmarkURLs: string[] = forceRefresh ? [] : Object.keys(bookmarkMappingCopy);

    const oldUrlSet = new Set(oldBookmarkURLs);
    const newUrlSet = new Set(newBookmarkURLs);

    const linksAdded = newUrlSet.difference(oldUrlSet);
    const linksRemoved = oldUrlSet.difference(newUrlSet);

    const progressTracker: ProgressTracker = new ProgressTracker(2, [0.1, 0.9]);
    const doProgressUpdate = async ({ removeProgress, addProgress }: { removeProgress: number, addProgress: number }) => {
      const progressValues: number[] = [removeProgress, addProgress];
      await onProgressUpdate(progressTracker.updateProgress(progressValues));
    }

    await doProgressUpdate({
      addProgress: 0.0,
      removeProgress: 0.0,
    });

    console.debug(`Links to add: ${linksAdded.size}`);
    console.debug(`Links to remove: ${linksRemoved.size}`);

    const newBookmarkContentMapping = {};

    // Remove old links
    for (const [linkIndex, linkToRemove] of enumerate(linksRemoved)) {
      delete bookmarkMappingCopy[linkToRemove];
      await doProgressUpdate({
        addProgress: 0.0,
        removeProgress: (linkIndex + 1) / linksRemoved.size,
      });
    }

    await doProgressUpdate({
      addProgress: 0.0,
      removeProgress: 1.0,
    });

    // Fetch content for new links to add

    // We want to process links in chunks of size 'n' and be able to do checkpoint saves after each chunk
    let itemsProcessed = 0;
    let self = this;
    async function scrapeTextFromLink(link: string): Promise<BookmarkEntry | null> {
      // Bookmarklets are to be skipped
      if (link.startsWith('javascript:'))
        return null;

      console.log(`Processing ${link}...`);
      const entry = await self._scrapeTextContent(link);

      if (!!entry) {
        newBookmarkContentMapping[entry.url] = entry;
        bookmarkMappingCopy[entry.url] = entry;
      }

      itemsProcessed += 1;
      await doProgressUpdate({
        addProgress: (itemsProcessed + 1) / linksAdded.size,
        removeProgress: 1.0,
      });

      if (itemsProcessed % 10 === 0) {
        await onCheckpointSave(bookmarkMappingCopy);
      }

      return entry;
    }

    await PromisePool
      .for([...linksAdded])
      .withConcurrency(8)
      .useCorrespondingResults()
      .process(async (item, index, pool) => {
        return await scrapeTextFromLink(item);
      });

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

