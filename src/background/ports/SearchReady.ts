import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import { generatePortHelperMethods } from "~/src/utils/port-messaging";


export type SearchReadyRequestBody = {
  command: string;
};

export type SearchReadyResponseBody = {
  isReady: boolean;
}


const handler: PlasmoMessaging.PortHandler<SearchReadyRequestBody, SearchReadyResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<SearchReadyRequestBody, SearchReadyResponseBody>(req, res);
  const searchNg = BookmarkSearchEngine.instance;

  // Initialize search engine if not ready
  if (!searchNg.isReady) {
    await searchNg.initialize();
  }

  if (req.body?.command !== 'start') {
    console.warn(`WARNING: Attempted to initiate unknown command "${req.body?.command}" from the "search ready" port`)
    return;
  } else {
    // Register an 'on ready' listener to communicate back to the popup for UI changes
    if (!searchNg.hasReadyListener) {
      searchNg.subscribeOnReady(isReady => {
        attemptResponseSend({ isReady });
      });
    }
  }

  // Send the current state of the search engine status
  attemptResponseSend({ isReady: BookmarkSearchEngine.instance.isReady });
}

export default handler;
