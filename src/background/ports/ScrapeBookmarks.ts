import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkScrapeEngine from '~/src/services/BookmarkScrapeService';
import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import type { BookmarkDatabase } from "~/src/interfaces/data-interfaces";
import LocalStorageService from "~/src/services/LocalStorageService";
import { generatePortHelperMethods } from "~/src/utils/port-messaging";


export type ScrapeBookmarksRequestBody = {
  command: string;
}

export type ScrapeBookmarksResponseBody = {
  progress: number;
  done: boolean;
  error: Error;
}


const handler: PlasmoMessaging.PortHandler<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody>(req, res);

  attemptResponseSend({
    progress: 0.0,
    done: false,
    error: null,
  });

  if (req.body?.command !== 'start') {
    console.warn(`WARNING: Attempted to initiate unknown command "${req.body?.command}" from the "scrape bookmarks" port`)
    return;
  }

  const scrapeNg = BookmarkScrapeEngine.instance;
  const searchNg = BookmarkSearchEngine.instance;
  const storageNg = LocalStorageService.instance;

  try {
    // Fetch old copy of database
    const oldData: BookmarkDatabase = await searchNg.fetchDatabase();

    // Start new scraping session
    const scanResults = await scrapeNg.scanBookmarkLinks(
      oldData,
      false,
      // Call every time a new progress update is reported by the scraping service
      async (progress: number) => {
        attemptResponseSend({
          progress: progress,
          done: false,
          error: null,
        });
      },
      // Call every time a backup of the database is requested by the scraping service
      async (mappingCheckpoint: BookmarkDatabase) => {
        await storageNg.persistDatabase(mappingCheckpoint);
      }
    );

    // Save a copy of the database and reload the search indices
    await searchNg.syncScanContent(scanResults);
  } catch (error) {
    console.error('UNEXPECTED ERROR IN scrape-bookmarks.handler')
    console.error(error);

    return attemptResponseSend({
      progress: 1.0,
      done: true,
      error: error,
    });
  }

  return attemptResponseSend({
    progress: 1.0,
    done: true,
    error: null,
  });
}

export default handler;
