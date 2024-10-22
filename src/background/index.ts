import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';

const searchNg = BookmarkSearchEngine.instance;
searchNg.initialize().then(() => console.log('READY'));
