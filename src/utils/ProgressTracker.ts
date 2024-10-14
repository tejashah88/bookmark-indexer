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

  updateProgress(values: number[]) {
    if (this.values.length !== values.length) {
      throw new Error('Passed value  array does not match number of progress values to track.')
    }

    this.values = values;
    return this.calcTotalProgress();
  }

  calcTotalProgress(): number {
    let numerator: number = 0;
    let denominator: number = 0;

    for (let i = 0; i < this.values.length; i++) {
      numerator += this.values[i] * this.weights[i];
      denominator += this.weights[i];
    }

    return +(numerator / denominator).toFixed(3);
  }
}
