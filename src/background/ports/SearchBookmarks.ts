import type { PlasmoMessaging } from "@plasmohq/messaging";

import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import type { BookmarkEntry } from "~/src/interfaces/data-interfaces";
import type { SearchBookmarksRequestBody, SearchBookmarksResponseBody } from "~/src/interfaces/port-interfaces";
import { generatePortHelperMethods } from "~src/utils/port-messaging";

const handler: PlasmoMessaging.PortHandler<SearchBookmarksRequestBody, SearchBookmarksResponseBody> = async (req, res) => {
  const [attemptResponseSend] = generatePortHelperMethods<SearchBookmarksRequestBody, SearchBookmarksResponseBody>(req, res);

  if (!!req.body?.queryString && req.body?.queryString.length > 0) {
    const searchNg = BookmarkSearchEngine.instance;

    const startTime = performance.now();
    const results: BookmarkEntry[] = await searchNg.searchBookmarks(req.body.queryString);
    const endTime = performance.now();

    attemptResponseSend({
      results,
      elapsedTime: endTime - startTime
    });
  } else {
    attemptResponseSend({
      results: [],
      elapsedTime: 0,
    });
  }
}

export default handler;
