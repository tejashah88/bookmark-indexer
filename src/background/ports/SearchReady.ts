import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import type { SearchReadyRequestBody, SearchReadyResponseBody } from "~/src/interfaces/port-interfaces";
import { generatePortHelperMethods } from "~/src/utils/port-messaging";

const handler: PlasmoMessaging.PortHandler<SearchReadyRequestBody, SearchReadyResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<SearchReadyRequestBody, SearchReadyResponseBody>(req, res);
  const searchNg = BookmarkSearchEngine.instance;

  // Initialize search engine if not ready
  if (!searchNg.isReady) {
    await searchNg.initialize();
  }

  if (req.body?.command !== 'start') {
    console.warn(`WARNING: Attempted to initiate unknown command "${req.body?.command}" from the "search ready" service`)
    return;
  } else {
    if (!searchNg.hasReadyListener) {
      searchNg.subscribeOnReady(isReady => {
        attemptResponseSend({ isReady });
      });
    }
  }

  attemptResponseSend({ isReady: BookmarkSearchEngine.instance.isReady });
}

export default handler;
