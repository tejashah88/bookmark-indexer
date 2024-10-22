import type { BookmarkEntry } from "./data-interfaces";

export type ScrapeBookmarksRequestBody = {
  command: string;
}

export type ScrapeBookmarksResponseBody = {
  progress: number;
  done: boolean;
  error: Error;
}

export type SearchBookmarksRequestBody = {
  queryString: string;
}

export type SearchBookmarksResponseBody = {
  results: BookmarkEntry[];
  elapsedTime: number;
}


export type SearchReadyRequestBody = {
  command: string;
};

export type SearchReadyResponseBody = {
  isReady: boolean;
}
