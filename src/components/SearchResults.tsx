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


function fetchAllSearchPositions(text: string, searchTerms: string[], numResults: number, minIndexOverlap: number): number[] {
  if (text.length === 0 || searchTerms.length === 0)
    return [];

  const allIndices = [];
  const searchQuery = new RegExp(`(${searchTerms.join('|')})`, 'gi');
  const matches = text.matchAll(searchQuery);

  while (allIndices.length < numResults) {
    const possibleMatch = matches.next();
    if (possibleMatch.done)
      break;

    if (allIndices.length === 0)
      allIndices.push(possibleMatch.value.index);
    else {
      const indexDistance = possibleMatch.value.index - allIndices[allIndices.length - 1];
      console.log(indexDistance);
      if (indexDistance > minIndexOverlap)
        allIndices.push(possibleMatch.value.index);
    }
  }

  return allIndices;
}


function showSearchedTextContext(text: string, range: number, startIndex: number = -1) {
  if (text.length === 0)
    return text;

  const lowerRange = Math.max(startIndex - range, 0);
  const upperRange = Math.min(startIndex + range, text.length);
  return text.substring(lowerRange, upperRange);
}


const TEXT_CONTEXT_RADIUS = 50;
const INDEX_RANGE_OVERLAP_LIMIT = 30;
const SUB_RESULTS_LIMIT = 3;


export default function SearchResults({ searchQuery, results, elapsedTime }: SearchResultsParams) {
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
                    <Highlight query={searchTerms} styles={{ px: '1', py: '1', bg: 'orange.100' }}>
                      {entry.title}
                    </Highlight>
                  </Heading>

                  {matchedIndices.map(posIndex => (
                    <Text key={posIndex} py="0" fontSize="sm">
                      <Highlight query={searchTerms} styles={{ px: '1', py: '1', bg: 'orange.100' }}>
                        {`▶ ${showSearchedTextContext(fullTextContent, TEXT_CONTEXT_RADIUS, posIndex)}`}
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
