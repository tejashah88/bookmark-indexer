import {
  Box,
  Card,
  CardBody,
  CardHeader,
  ChakraProvider,
  Divider,
  Heading,
  Link,
  Highlight,
  Stack,
  StackDivider,
  Text
} from '@chakra-ui/react';

import React from 'react';
import type { BookmarkEntry } from '~/src/interfaces/data-interfaces';


interface SearchResultsParams {
  searchQuery: string,
  results: BookmarkEntry[],
  elapsedTime: number,
}


// Given the original text content and a list of clean search terms, perform a regex search and lazily return the
// first 'n' results (via numResults). Excludes search results whose indices are closer than 'minIndexOverlap'.
function fetchAllSearchPositions(text: string, searchTerms: string[], numResults: number, minIndexOverlap: number): number[] {
  if (text.length === 0 || searchTerms.length === 0)
    return [];

  const allIndices = [];
  const searchQuery = new RegExp(`(${searchTerms.join('|')})`, 'gi');
  const matches = text.matchAll(searchQuery);

  // Keep looking for the next match while we don't have enough
  while (allIndices.length < numResults) {
    const possibleMatch = matches.next();
    // If we've exhausted on the possible matches, return early
    if (possibleMatch.done)
      break;

    if (allIndices.length === 0)
      allIndices.push(possibleMatch.value.index);
    else {
      // Compute the distance between the last match's index and the current match's index
      // If said distance is lower than 'minIndexOverlap', then skip to the next result
      const indexDistance = possibleMatch.value.index - allIndices[allIndices.length - 1];
      if (indexDistance < minIndexOverlap)
        continue;

      allIndices.push(possibleMatch.value.index);
    }
  }

  return allIndices;
}


// Given the original text content and the match index, return a subset of the text content
// between the range of [matchIndex - range, matchIndex + range]
function showSearchedTextContext(text: string, matchIndex: number, range: number) {
  if (text.length === 0)
    return text;

  const lowerRange = Math.max(matchIndex - range, 0);
  const upperRange = Math.min(matchIndex + range, text.length);
  return text.substring(lowerRange, upperRange);
}


const SUB_RESULTS_LIMIT = 3;
const INDEX_RANGE_OVERLAP_LIMIT = 30;
const TEXT_CONTEXT_RADIUS = 50;


// Sub-component to dispaly search results, including highlighting
export default function SearchResults({ searchQuery, results, elapsedTime }: SearchResultsParams) {
  // Create a list of search terms for displaying sub-results and relevent highlighting
  const searchTerms: string[] = searchQuery
    .toLocaleLowerCase()
    .split(' ')
    .map(term => term.trim())
    .filter(term => term.length > 0);

  return (
    <ChakraProvider>
      <Card>
        <CardHeader padding="4">
          <Heading size="md">Search Results {results.length && `(${elapsedTime.toFixed(2)} ms)`}</Heading>
        </CardHeader>

        <Divider/>

        <CardBody padding="4">
          <Stack divider={<StackDivider />} spacing="2" overflowX="auto" maxHeight='350'>
            {results.map((entry, index) => {
              const fullTextContent = entry.content
                .trim()
                .toLocaleLowerCase();

              const matchedIndices = fetchAllSearchPositions(fullTextContent, searchTerms, SUB_RESULTS_LIMIT, INDEX_RANGE_OVERLAP_LIMIT);

              return (
                <Box key={index}>
                  <Heading size="sm">
                    <Highlight query={searchTerms} styles={{ px: '1', bg: 'teal.100' }}>
                      {entry.title}
                    </Highlight>
                  </Heading>

                  {matchedIndices.map((posIndex, index) => (
                    <Text key={index} py="0" fontSize="sm">
                      <Highlight query={searchTerms} styles={{ px: '1', bg: 'teal.100' }}>
                        {`▶ ${showSearchedTextContext(fullTextContent, posIndex, TEXT_CONTEXT_RADIUS)}`}
                      </Highlight>
                    </Text>
                  ))}

                  <Link fontSize="sm" color='teal.500' href={entry.url}>
                    {entry.url}
                  </Link>
                </Box>
              );
            })}
          </Stack>
        </CardBody>
      </Card>
    </ChakraProvider>
  );
}
