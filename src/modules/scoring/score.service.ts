import { Injectable } from '@nestjs/common';

@Injectable()
export class ScoreService {
  calculateScore(totalTests: number, approvedTests: number): number {
    if (totalTests <= 0) {
      return 0;
    }

    const score = (approvedTests / totalTests) * 100;
    return Number(score.toFixed(2));
  }
}
