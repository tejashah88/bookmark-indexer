import { Storage } from '@plasmohq/storage';
import { StorageKeys } from '~/src/utils/constants';

import type { BookmarkDatabase } from '~/src/interfaces/data-interfaces';


export interface StorageStats {
  numIndexedBookmarks: number;
  storageSize: number;
}


// Service class to manage limited access to chrome's local storage
export default class LocalStorageService {
  static #instance: LocalStorageService;

  storage: Storage;

  private constructor() {
    this.storage = new Storage({
      area: 'local'
    });
  }


  public static get instance(): LocalStorageService {
    if (!LocalStorageService.#instance) {
      LocalStorageService.#instance = new LocalStorageService();
    }

    return LocalStorageService.#instance;
  }


  //////////////////////////
  // Manage Database Data //
  //////////////////////////

  // Fetch number of indexed bookmarks and size of database saved in local storage
  async fetchStorageStats(): Promise<StorageStats> {
    const allData: Record<string, string> = await this.storage.rawGetAll();
    const rawData = allData[StorageKeys.Database];

    const numIndexedBookmarks = Object.keys(JSON.parse(rawData)).length;
    const storageSize = rawData.length;

    return { numIndexedBookmarks, storageSize } as StorageStats;
  }


  // Fetch entire database with proper type casting
  async fetchDatabase(): Promise<BookmarkDatabase> {
    let bookmarkData: BookmarkDatabase | null = await this.storage.get<BookmarkDatabase>(StorageKeys.Database);
    if (!bookmarkData) {
      // Ensure the storage key is not empty
      await this.storage.set(StorageKeys.Database, {});
      bookmarkData = {};
    }

    return bookmarkData;
  }


  // Save entirety database to local storage
  async persistDatabase(data: BookmarkDatabase): Promise<void> {
    await this.storage.set(StorageKeys.Database, data);
  }


  // Wipe the stored database from local storage
  async resetDatabase(): Promise<void> {
    await this.storage.set(StorageKeys.Database, {});
  }
}
