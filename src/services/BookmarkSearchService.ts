import type {
  BookmarkEntry,
  BookmarkDatabase,
  ScanBookmarksResults,
  BookmarkEntryWithScore,
} from '~/src/interfaces/data-interfaces';

import LocalStorageService from '~/src/services/LocalStorageService';
import MiniSearch, { type SearchResult } from 'minisearch';


enum InitStatus {
  NOT_READY,
  IN_PROGRESS,
  READY,
}


export default class BookmarkSearchEngine {
  static #instance: BookmarkSearchEngine;

  private storage: LocalStorageService;
  private index: MiniSearch<BookmarkEntry>;

  private readonly SEARCH_LIMIT: number = 20;

  private _status: InitStatus = InitStatus.NOT_READY;
  private readyListener: (value: boolean) => void | null;

  private constructor() {
    this.storage = LocalStorageService.instance;

    this.index = new MiniSearch({
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
      this._addOrUpdateContent(bookmarkMapping);

      this.status = InitStatus.READY;
      this.readyListener = null;
    }
  }


  async reinitialize(): Promise<void> {
    this.index = new MiniSearch({
      idField: 'url',
      fields: ['title', 'content'],
      storeFields: ['title', 'content'],
      searchOptions: {
        // Sets weights of importanct for scoring
        boost: {
          'title': 1,
          'content': 1
        },
        combineWith: 'AND',
        fuzzy: 0.2,
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


  private _addOrUpdateContent(data: BookmarkDatabase): void {
    for (const key of Object.keys(data)) {
      if (this.index.has(key)) {
        this.index.replace(data[key])
      } else {
        this.index.add(data[key]);
      }
    }
  }


  private async _removeContent(keys: Array<string>): Promise<void> {
    for (const key of keys) {
      this.index.discard(key);
    }
  }


  //////////////////////
  // Handle searching //
  //////////////////////

  async searchBookmarks(searchText: string): Promise<BookmarkEntryWithScore[]> {
    // Perform search against bookmark entries
    const searchRawResults: SearchResult[] = this.index.search(searchText);

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
