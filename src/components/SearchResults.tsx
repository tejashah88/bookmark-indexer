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
import type { BookmarkEntry } from '~src/interfaces/data-interfaces';


interface SearchResultsParams {
  searchQuery: string,
  results: BookmarkEntry[],
  elapsedTime: number,
}


function fetchAllSearchPositions(text: string, query: string): number[] {
  if (text.length === 0 || query.length === 0)
    return [];

  const allIndices = [];
  let foundIndex = -1;

  while (true) {
    foundIndex = text.indexOf(query, foundIndex + 1);
    if (foundIndex === -1)
      return allIndices;

    allIndices.push(foundIndex);
  }
}


function showSearchedTextContext(text: string, query: string, range: number, startIndex: number = -1) {
  if (text.length === 0 || query.length === 0)
    return text;

  const foundIndex = text.indexOf(query, startIndex);
  if (foundIndex === -1)
    return text;

  const lowerRange = Math.max(foundIndex - range, 0);
  const upperRange = Math.min(foundIndex + range, text.length);
  return text.substring(lowerRange, upperRange);
}


export default function SearchResults({ searchQuery, results, elapsedTime }: SearchResultsParams) {
  return (
    <ChakraProvider>
      <Card>
        <CardHeader padding="4">
          <Heading size="md">Search Results {results.length && `(${elapsedTime} ms)`}</Heading>
        </CardHeader>

        <Divider/>

        <CardBody padding="4">
          <Stack divider={<StackDivider />} spacing="2" overflowX="auto" maxHeight='350'>
            {results.map((entry, index) => (
              <Box key={index}>
                <Heading size="sm">
                  <Highlight query={searchQuery.split(' ')} styles={{ px: '1', py: '1', bg: 'orange.100' }}>
                    {entry.title}
                  </Highlight>
                </Heading>

                {fetchAllSearchPositions(entry.content, searchQuery).slice(0, 3).map(posIndex => (
                  <Text key={posIndex} py="0" fontSize="sm">
                    <Highlight query={searchQuery.split(' ')} styles={{ px: '1', py: '1', bg: 'orange.100' }}>
                      {`▶ ${showSearchedTextContext(entry.content, searchQuery, 50, posIndex)}`}
                    </Highlight>
                  </Text>
                ))}

                <Link fontSize="sm" color='teal.500' href={entry.url}>
                  {entry.url}
                </Link>
              </Box>
            ))}
          </Stack>
        </CardBody>
      </Card>
    </ChakraProvider>
  );
}
