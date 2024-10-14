import { Storage } from '@plasmohq/storage';
import { StorageKeys } from '~/src/utils/constants';

import type { BookmarkDatabase } from '~/src/interfaces/data-interfaces';


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

  async fetchRawDatabase(): Promise<string> {
    const rawData: Record<string, string> = await this.storage.rawGetAll();
    return rawData[StorageKeys.Database];
  }


  async fetchDatabase(): Promise<BookmarkDatabase> {
    let bookmarkData: BookmarkDatabase | null = await this.storage.get<BookmarkDatabase>(StorageKeys.Database);
    if (!bookmarkData) {
      // Ensure the storage key is not empty
      await this.storage.set(StorageKeys.Database, {});
      bookmarkData = {};
    }

    return bookmarkData;
  }


  async persistDatabase(data: BookmarkDatabase): Promise<void> {
    await this.storage.set(StorageKeys.Database, data);
  }


  async resetDatabase(): Promise<void> {
    await this.storage.set(StorageKeys.Database, {});
  }
}
