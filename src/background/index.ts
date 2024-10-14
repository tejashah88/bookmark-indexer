import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';
import BookmarkScrapeEngine from '~src/services/BookmarkScrapeService';

const searchNg = BookmarkSearchEngine.instance;
searchNg.initialize().then(() => console.log('READY'));
