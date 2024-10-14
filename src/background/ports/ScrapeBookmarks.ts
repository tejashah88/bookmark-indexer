import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkScrapeEngine from '~/src/services/BookmarkScrapeService';
import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import type { BookmarkDatabase } from "~/src/interfaces/data-interfaces";
import type { ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody } from "~/src/interfaces/port-interfaces";
import LocalStorageService from "~/src/services/LocalStorageService";
import { generatePortHelperMethods } from "~/src/utils/port-messaging";


const handler: PlasmoMessaging.PortHandler<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody>(req, res);

  attemptResponseSend({
    progress: 0.0,
    done: false,
    error: null,
  });

  if (req.body?.command !== 'start') {
    console.warn(`WARNING: Attempted to initiate unknown command "${req.body?.command}" from the "scrape bookmarks" service`)
    return;
  }

  const scrapeNg = BookmarkScrapeEngine.instance;
  const searchNg = BookmarkSearchEngine.instance;
  const storageNg = LocalStorageService.instance;

  try {
    const oldData: BookmarkDatabase = await searchNg.fetchDatabase();
    const scanResults = await scrapeNg.scanBookmarkLinks(
      oldData,
      false,
      async (progress: number) => {
        attemptResponseSend({
          progress: progress,
          done: false,
          error: null,
        });
      },
      async (mappingCheckpoint: BookmarkDatabase) => {
        await storageNg.persistDatabase(mappingCheckpoint);
      }
    );

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
