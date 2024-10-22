
import FlexSearch from 'flexsearch';

import type {
  BookmarkEntry,
  BookmarkDatabase,
  ScanBookmarksResults,
} from '~/src/interfaces/data-interfaces';

import LocalStorageService from '~/src/services/LocalStorageService';
import type { DocumentSearchResult } from 'flexsearch';


interface FlexsearchFieldSearchResult<T> {
  id: string | number;
  doc: T;
}


enum InitStatus {
  NOT_READY,
  IN_PROGRESS,
  READY,
}


declare module "flexsearch" {
  interface Document<T, Store extends StoreOption = false> {
    contain(id: Id): boolean;
  }
}


export default class BookmarkSearchEngine {
  static #instance: BookmarkSearchEngine;

  private storage: LocalStorageService;
  private index: FlexSearch.Document<BookmarkEntry, true>;

  private readonly SEARCH_LIMIT: number = 20;

  private _status: InitStatus = InitStatus.NOT_READY;
  private readyListener: (value: boolean) => void | null;

  private constructor() {
    this.storage = LocalStorageService.instance;

    this.index = new FlexSearch.Document({
      // preset: 'score',
      language: 'en',
      charset: 'latin:advanced',
      tokenize: 'strict',// 'forward',
      resolution: 3,
      cache: 100,
      document: {
        id: 'url',
        tag: false,
        index: ['title', 'content'],
        store: true,
      }
    });
  }

  public static get instance(): BookmarkSearchEngine {
    if (!BookmarkSearchEngine.#instance) {
      BookmarkSearchEngine.#instance = new BookmarkSearchEngine();
    }

    return BookmarkSearchEngine.#instance;
  }


  // NOTE: We have an explicit initialization method since constructors cannot handle async logic in a straightforward manner
  async initialize(): Promise<void> {
    // Only start the initialization sequence when we're not ready and idle
    if (this.status == InitStatus.NOT_READY) {
      this.status = InitStatus.IN_PROGRESS;

      // Fetch the database and load it into the index
      const bookmarkMapping: BookmarkDatabase = await this.fetchDatabase();
      await this._addOrUpdateContent(bookmarkMapping);

      this.status = InitStatus.READY;
      this.readyListener = null;
    }
  }


  async reinitialize(): Promise<void> {
    this.index = new FlexSearch.Document({
      // preset: 'score',
      language: 'en',
      charset: 'latin:advanced',
      tokenize: 'strict',// 'forward',
      resolution: 3,
      cache: 100,
      document: {
        id: 'url',
        tag: false,
        index: ['title', 'content'],
        store: true,
      }
    });

    this.status = InitStatus.NOT_READY;
    await this.initialize();
  }


  public get status(): InitStatus {
    return this._status;
  }

  public get isReady(): boolean {
    return this._status == InitStatus.READY;
  }

  public get hasReadyListener(): boolean {
    return !!this.readyListener;
  }


  public set status(value: InitStatus) {
    this._status = value;

    if (this.hasReadyListener) {
      this.readyListener(this.isReady);
    }
  }


  subscribeOnReady(listener: (value: boolean) => void) {
    this.readyListener = listener;
  }

  unsubscribeOnReady() {
    this.readyListener = null;
  }


  /////////////////////
  // Manage Database //
  /////////////////////

  async fetchDatabase(): Promise<BookmarkDatabase> {
    const bookmarkMapping: BookmarkDatabase = await this.storage.fetchDatabase();
    return bookmarkMapping;
  }


  private async _persistDatabase(bookmarkDb: BookmarkDatabase) {
    await this.storage.persistDatabase(bookmarkDb);
  }


  /////////////////////////////
  // Manage Bookmark Content //
  /////////////////////////////

  async syncScanContent(results: ScanBookmarksResults): Promise<void> {
    const { newData, bookmarksAdded, bookmarksRemoved } = results;

    // Save new data to local storage
    await this._persistDatabase(newData);

    // Remove old keys
    await this._removeContent(bookmarksRemoved.keys);

    // Add new keys
    await this._addOrUpdateContent(bookmarksAdded.content);
  }


  private async _addOrUpdateContent(data: BookmarkDatabase): Promise<void> {
    for (const key of Object.keys(data)) {
      if (this.index.contain(key)) {
        await this.index.updateAsync(key, data[key])
      } else {
        await this.index.addAsync(key, data[key]);
      }
    }
  }


  private async _removeContent(keys: Array<string>): Promise<void> {
    for (const key of keys) {
      await this.index.removeAsync(key);
    }
  }


  //////////////////////
  // Handle searching //
  //////////////////////

  async searchBookmarks(searchText: string): Promise<BookmarkEntry[]> {
    // Perform search against bookmark entries
    const searchResults: DocumentSearchResult<BookmarkEntry, true, true> = await this.index.searchAsync<true>({
      query: searchText,
      limit: this.SEARCH_LIMIT,
      index: ['title', 'content'],
      enrich: true,
      bool: "or"
    });

    // Extract entries based on each indexed field
    const entriesByTitle: FlexsearchFieldSearchResult<BookmarkEntry>[] = (searchResults
      .find(resultsChunk => resultsChunk.field === 'title') || { result: [] })
      .result as FlexsearchFieldSearchResult<BookmarkEntry>[];


    const entriesByContent: FlexsearchFieldSearchResult<BookmarkEntry>[] = (searchResults
      .find(resultsChunk => resultsChunk.field === 'content') || { result: [] })
      .result as FlexsearchFieldSearchResult<BookmarkEntry>[];


    // Check that we have some results to show
    const totalResults = entriesByTitle.length + entriesByContent.length;
    if (totalResults === 0)
      return [];

    const urlsByTitle   = new Set(entriesByTitle.map(entry => entry.id));
    const urlsByContent = new Set(entriesByContent.map(entry => entry.id));
    const urlsByBoth    = urlsByTitle.intersection(urlsByContent);

    // Sort search results in the following order, with ordering of all subsets of results preserved...
    // 1. Matching title AND content
    // 3. Matching title
    // 2. Matching content

    // NOTE: Sets preserve insertion order, which lets us insert subsets of results at a time
    const orderedResultIds = [...new Set([
      ...urlsByBoth,
      ...urlsByTitle,
      ...urlsByContent,
    ])];

    const results: BookmarkEntry[] = orderedResultIds
      .map((id: string) => {
        return  entriesByTitle.find(entry => entry.id === id)?.doc ||
                entriesByContent.find(entry => entry.id === id)?.doc
      })
      // NOTE: This should NEVER yield undefined logically, but the safeguard is present because JavaScript.js...
      .filter(entryDoc => !!entryDoc)

    return results;
  }
}
