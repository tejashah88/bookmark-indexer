/**
 * Same as Promise.all(items.map(item => task(item))), but it waits for
 * the first {batchSize} promises to finish before starting the next batch.
 *
 * This version allows specifying a callback upon each batch processed.
 *
 * Modified from source: https://stackoverflow.com/a/64543086
 */
export async function promiseAllInBatches<A, B>(
  items: A[],
  batchSize: number,
  task: (value: A) => Promise<B>,
  onBatchProcessed: (batch: B[]) => Promise<any>,
): Promise<B[]> {
  let position = 0;
  let results = [];

  while (position < items.length) {
    const itemsForBatch: A[] = items.slice(position, position + batchSize);
    const newResultsBatch: B[] = await Promise.all(itemsForBatch.map(item => task(item)));

    await onBatchProcessed(newResultsBatch);
    results = [...results, ...newResultsBatch];
    position += batchSize;
  }

  return results;
}


export async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
