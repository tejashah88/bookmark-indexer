import {
  Button,
  ChakraProvider,
  Flex,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Spacer,
  Progress,
  useToast,
  CircularProgress
} from '@chakra-ui/react';

import React, { useEffect, useState } from 'react';
import { usePort } from "@plasmohq/messaging/hook";
import { FaInfoCircle, FaSync, FaTrashAlt } from 'react-icons/fa';

import SearchResults from '~/src/components/SearchResults';
import LocalStorageService, { type StorageStats } from '~/src/services/LocalStorageService';
import BookmarkSearchEngine from '~/src/services/BookmarkSearchService';

import type { ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody } from '~/src/background/ports/ScrapeBookmarks';
import type { SearchBookmarksRequestBody, SearchBookmarksResponseBody } from '~/src/background/ports/SearchBookmarks';
import type { SearchReadyRequestBody, SearchReadyResponseBody } from '~/src/background/ports/SearchReady';

import '~/src/popup.css';

// Main UI for popup page
export default function PopupPage() {
  const scanBookmarksPort = usePort<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody>('ScrapeBookmarks');
  const searchBookmarksPort = usePort<SearchBookmarksRequestBody, SearchBookmarksResponseBody>('SearchBookmarks');
  const searchReadyPort = usePort<SearchReadyRequestBody, SearchReadyResponseBody>('SearchReady');


  // Call this function to pre-emptively listn to when the search engine service is ready
  function listenToIsReady(): void {
    searchReadyPort.send({ command: 'start' });
  }


  // Call this function to execute a search query
  function doSearchRequest(queryString: string): void {
    searchBookmarksPort.send({ queryString });
  }


  const isSearchReady = typeof searchReadyPort.data !== 'undefined' && searchReadyPort.data?.isReady;
  const isBusy = typeof scanBookmarksPort.data !== 'undefined' && !scanBookmarksPort.data?.done;
  const hasSearchResults = typeof searchBookmarksPort.data !== 'undefined' && searchBookmarksPort.data?.results.length > 0;


  const toast = useToast();
  const [search, setSearch] = useState('');

  // Initialize an 'on ready' listener to control if the 'Search' button should
  // be enabled or not based on the status of the search engine service.
  useEffect(() => {
    listenToIsReady();
    return () => {
      BookmarkSearchEngine.instance.unsubscribeOnReady();
    };
  }, []);


  return (
    <ChakraProvider>
      <div
        style={{
          padding: 16
        }}>
        {isBusy &&
          <Progress
            size='sm'
            hasStripe
            isAnimated
            min={0}
            max={1}
            value={scanBookmarksPort.data?.progress ?? 0}
          />
        }

        <Flex my="2">
          <Heading as="h2" fontSize="2xl">
            Bookmark Indexer
          </Heading>
          <Spacer />
          <IconButton
            mx="1"
            aria-label="Show Technical Information"
            icon={<FaInfoCircle />}
            onClick={async () => {
              const { numIndexedBookmarks, storageSize } = await LocalStorageService.instance.fetchStorageStats();
              const infoLines = [
                `Number of indexed bookmarks: ${numIndexedBookmarks}`,
                `Storage size of documents: ${(storageSize / (1024 * 1024)).toFixed(2)} MB`,
              ];

              infoLines.forEach(line => {
                toast({
                  title: line,
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              });
            }}
          />

          <IconButton
            mx="1"
            aria-label="Scan for bookmarks"
            icon={<FaSync />}
            disabled={isBusy}
            onClick={async () => {
              scanBookmarksPort.send({
                command: 'start'
              });
            }}
          />

          {/* NOTE: Not using options UI */}
          {/* <IconButton
            mx="1"
            aria-label="Open Options"
            icon={<IoMdSettings />}
            onClick={() => chrome.runtime.openOptionsPage()}
          /> */}

          {/* HACK: A dirty way to hide the 'nuke database' button */}
          {search === 'IMUSTCOMMITSUDOKU' && <IconButton
            mx="1"
            aria-label="Reset Database"
            icon={<FaTrashAlt />}
            bgColor="red.300"
            onClick={async () => {
              // Nuke the database and reinitialize the search engine
              await LocalStorageService.instance.resetDatabase();
              await BookmarkSearchEngine.instance.reinitialize();

              toast({
                title: 'All data has been deleted.',
                status: 'error',
                duration: 5000,
                isClosable: true,
              })
            }}
          />}
        </Flex>

        <InputGroup size="md" mb='2'>
          <Input
            placeholder="Search bookmarks"
            focusBorderColor="teal.400"
            autoFocus={true}
            onChange={(event) => {
              setSearch(event.target.value);
              doSearchRequest(event.target.value);
            }}
            onKeyDown={event => event.key === 'Enter' ? doSearchRequest(search) : null}
            value={search}
          />
          <InputRightElement width="4.8rem">
            <Button
              size="sm"
              onClick={() => doSearchRequest(search)}
              disabled={!isSearchReady}
            >
              {isSearchReady ? 'Search' : <CircularProgress isIndeterminate size='20px'/>}
            </Button>
          </InputRightElement>
        </InputGroup>

        {/*
          HACK: 'search.length > 0' is apparently needed because even if the search results return an empty array from a
          blank string, the SearchResults.tsx component is still trying to render?? (Could be a "dev" mode situation??)
        */}
        {hasSearchResults && search.length > 0 &&
          <SearchResults
            searchQuery={search}
            results={searchBookmarksPort.data?.results}
            elapsedTime={searchBookmarksPort.data?.elapsedTime ?? 0}
          />
        }
      </div>
    </ChakraProvider>
  );
}
