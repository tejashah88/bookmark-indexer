import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import type { SearchReadyRequestBody, SearchReadyResponseBody } from "~/src/interfaces/port-interfaces";
import { generatePortHelperMethods } from "~src/utils/port-messaging";

const handler: PlasmoMessaging.PortHandler<SearchReadyRequestBody, SearchReadyResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<SearchReadyRequestBody, SearchReadyResponseBody>(req, res);

  if (req.body?.command !== 'start') {
    console.warn(`WARNING: Attempted to initiate unknown command "${req.body?.command}" from the "scrape bookmarks" service`)
    return;
  } else {
    if (!BookmarkSearchEngine.instance.hasReadyListener) {
      BookmarkSearchEngine.instance.subscribeOnReady(isReady => {
        attemptResponseSend({ isReady });
      });
    }
  }

  attemptResponseSend({ isReady: BookmarkSearchEngine.instance.isReady });
}

export default handler;
