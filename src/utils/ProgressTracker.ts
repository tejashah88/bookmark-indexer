// Utility class to track and calculate overall progress based on subtask progress updates.
// Allows for arbitrary number of subtasks and customizable weights for each subtask's progress.
export default class ProgressTracker {
  values: number[];
  weights: number[];

  constructor(numValues: number, weights?: number[]) {
    this.values = new Array(numValues).fill(0);

    if (typeof weights === 'undefined') {
      this.weights = new Array(numValues).fill(1);
    } else {
      if (numValues !== weights!.length)
        throw new Error('Weights array does not match number of progress values to track.')
      this.weights = weights;
    }
  }


  // Update the subtask progress values and recalculate overall progress
  updateProgress(values: number[]) {
    if (this.values.length !== values.length) {
      throw new Error('Passed value  array does not match number of progress values to track.')
    }

    this.values = values;
    return this.calcTotalProgress();
  }


  // Calculate the overall progress based on the following formula
  //  - Formula: sum(v[i] * w[i]) / sum(w[i])
  calcTotalProgress(): number {
    let numerator: number = 0;
    let denominator: number = 0;

    for (let i = 0; i < this.values.length; i++) {
      numerator += this.values[i] * this.weights[i];
      denominator += this.weights[i];
    }

    // Report progress to 4 decimal places (XX.XX %)
    return +(numerator / denominator).toFixed(4);
  }
}
