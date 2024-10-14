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
  useToast
} from '@chakra-ui/react';

import React, { useState } from 'react';
import { usePort } from "@plasmohq/messaging/hook";
import { getPort, listen } from "@plasmohq/messaging/port";

import { FaInfo, FaInfoCircle, FaSync, FaTrash, FaTrashAlt } from 'react-icons/fa';
import { IoMdSettings } from 'react-icons/io';

import SearchResults from '~/src/components/SearchResults';
import type {
  ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody,
  SearchBookmarksRequestBody, SearchBookmarksResponseBody
} from '~/src/interfaces/port-interfaces';
import '~/src/popup.css';
import LocalStorageService from './services/LocalStorageService';
import BookmarkSearchEngine from './services/BookmarkSearchService';


// TODO/HACK: Too lazy to make it's own port/message, will do if necessary (Tejas Shah - 10/13/2024)
async function TMP_fetchStorageInfo() {
  const rawData: string = await LocalStorageService.instance.fetchRawDatabase();
  const numIndexedBookmarks = Object.keys(JSON.parse(rawData)).length;
  const storageSize = rawData.length;

  return {
    numIndexedBookmarks,
    storageSize,
  }
}


export default function PopupPage() {
  const [search, setSearch] = useState('');

  const scanBookmarksPort = usePort<ScrapeBookmarksRequestBody, ScrapeBookmarksResponseBody>('ScrapeBookmarks');;
  const searchBookmarksPort = usePort<SearchBookmarksRequestBody, SearchBookmarksResponseBody>('SearchBookmarks');

  function doSearchRequest(queryString: string): void {
    searchBookmarksPort.send({ queryString });
  }

  const isBusy = typeof scanBookmarksPort.data !== 'undefined' && !scanBookmarksPort.data?.done;
  // HELP: This (searchBarIsEmpty) is apparently needed because even if the search results return an empty array from a
  // blank string, the SearchResults.tsx component is still trying to render?? (Could be a "dev" mode situation??)
  const searchBarIsEmpty = search.length > 0;
  const hasSearchResults = typeof searchBookmarksPort.data !== 'undefined' && searchBookmarksPort.data?.results.length > 0;

  const toast = useToast();

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
              const { numIndexedBookmarks, storageSize } = await TMP_fetchStorageInfo();
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
            >
              Search
            </Button>
          </InputRightElement>
        </InputGroup>

        {hasSearchResults && searchBarIsEmpty &&
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
