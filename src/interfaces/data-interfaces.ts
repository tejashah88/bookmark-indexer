export interface BookmarkEntry {
  url: string;
  title: string;
  content: string;
}


export interface BookmarkDatabase {
  [key: string]: BookmarkEntry;
}


export interface ScanBookmarksResults {
  newData: BookmarkDatabase,
  bookmarksAdded: {
    keys: Array<string>,
    content: BookmarkDatabase,
  },
  bookmarksRemoved: {
    keys: Array<string>,
  }
}
