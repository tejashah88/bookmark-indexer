import type {
  BookmarkEntry,
  BookmarkDatabase,
  ScanBookmarksResults,
  BookmarkEntryWithScore,
} from '~/src/interfaces/data-interfaces';

import LocalStorageService from '~/src/services/LocalStorageService';
import MiniSearch, { type Options, type SearchResult } from 'minisearch';


enum InitStatus {
  NOT_READY,
  IN_PROGRESS,
  READY,
}


// Service class to handle bookmark content searching via 'minisearch'
export default class BookmarkSearchEngine {
  static #instance: BookmarkSearchEngine;

  private storage: LocalStorageService;
  private index: MiniSearch<BookmarkEntry>;

  private _status: InitStatus = InitStatus.NOT_READY;
  private readyListener: (value: boolean) => void | null;

  // Limit for max number of documents to be returned from search
  private readonly SEARCH_LIMIT: number = 20;


  // Search options to use for initializing search index
  private readonly SEARCH_INDEX_OPTIONS: Options<BookmarkEntry> = {
    idField: 'url',
    fields: ['title', 'content'],
    storeFields: ['title', 'content'],
    searchOptions: {
      // Sets weights of importanct for scoring
      boost: {
        'title': 1,
        'content': 1
      },
      combineWith: 'OR',
      fuzzy: 0.2,
    }
  };


  private constructor() {
    this.storage = LocalStorageService.instance;

    this.index = new MiniSearch(this.SEARCH_INDEX_OPTIONS);
  }


  public static get instance(): BookmarkSearchEngine {
    if (!BookmarkSearchEngine.#instance) {
      BookmarkSearchEngine.#instance = new BookmarkSearchEngine();
    }

    return BookmarkSearchEngine.#instance;
  }


  //////////////////////////////
  // Initialization Functions //
  //////////////////////////////


  // NOTE: We have an explicit initialization method since constructors cannot handle async logic in a straightforward manner
  async initialize(): Promise<void> {
    // Only start the initialization sequence when we're not ready and idle
    if (this.status == InitStatus.NOT_READY) {
      this.status = InitStatus.IN_PROGRESS;

      // Fetch the database and load it into the database index
      const bookmarkMapping: BookmarkDatabase = await this.fetchDatabase();
      this._addOrUpdateContent(bookmarkMapping);

      this.status = InitStatus.READY;
      this.readyListener = null;
    }
  }


  // Allows reinitializing the database index
  async reinitialize(): Promise<void> {
    this.index = new MiniSearch(this.SEARCH_INDEX_OPTIONS);

    this.status = InitStatus.NOT_READY;
    await this.initialize();
  }


  ////////////////////////
  // Manage Init Status //
  ////////////////////////


  // Helper method to access initialization status
  public get status(): InitStatus {
    return this._status;
  }


  // Helper method to check if search engine is ready for usage
  public get isReady(): boolean {
    return this._status == InitStatus.READY;
  }


  // Helper method to check if an 'on ready' listener is attached to this instance
  public get hasReadyListener(): boolean {
    return !!this.readyListener;
  }


  // Helper method to set the initalization status, while updating any 'on ready' listeners
  public set status(value: InitStatus) {
    this._status = value;

    if (this.hasReadyListener) {
      this.readyListener(this.isReady);
    }
  }


  // Helper method to add an 'on ready' listener
  subscribeOnReady(listener: (value: boolean) => void) {
    if (!this.readyListener)
      this.readyListener = listener;
  }


  // Helper method to remove the previously attached 'on ready' listener
  unsubscribeOnReady() {
    if (!!this.readyListener)
      this.readyListener = null;
  }

  /////////////////////
  // Manage Database //
  /////////////////////

  // Fetch the entire bookmark database mapping from local storage (alias method)
  async fetchDatabase(): Promise<BookmarkDatabase> {
    const bookmarkMapping: BookmarkDatabase = await this.storage.fetchDatabase();
    return bookmarkMapping;
  }

  // Save the entire bookmark database mapping to local storage (alias method)
  private async _persistDatabase(bookmarkDb: BookmarkDatabase) {
    await this.storage.persistDatabase(bookmarkDb);
  }


  /////////////////////////////
  // Manage Bookmark Content //
  /////////////////////////////

  // Synchronize the scanned bookmark results into local storage and the database index
  async syncScanContent(results: ScanBookmarksResults): Promise<void> {
    const { newData, bookmarksAdded, bookmarksRemoved } = results;

    // Save new data to local storage
    await this._persistDatabase(newData);

    // Remove old keys
    await this._removeContent(bookmarksRemoved.keys);

    // Add new keys
    this._addOrUpdateContent(bookmarksAdded.content);
  }


  // Add or update database index entries based on new database mapping
  private _addOrUpdateContent(data: BookmarkDatabase): void {
    for (const key of Object.keys(data)) {
      if (this.index.has(key)) {
        this.index.replace(data[key])
      } else {
        this.index.add(data[key]);
      }
    }
  }


  // Remove database index entries based on new database mapping
  private async _removeContent(keys: Array<string>): Promise<void> {
    for (const key of keys) {
      this.index.discard(key);
    }
  }


  //////////////////////
  // Handle searching //
  //////////////////////

  // Main function for executing search against bookmark content database
  async searchBookmarks(searchText: string): Promise<BookmarkEntryWithScore[]> {
    // Perform search against bookmark entries
    const searchRawResults: SearchResult[] = this.index.search(searchText);

    // Only return up to 'SEARCH_LIMIT' results
    const searchResults: BookmarkEntryWithScore[] = searchRawResults
      .slice(0, this.SEARCH_LIMIT)
      .map(result => {
        return {
          url: result.id,
          title: result.title,
          content: result.content,
          score: result.score,
        } as BookmarkEntryWithScore
      });

    return searchResults;
  }
}
