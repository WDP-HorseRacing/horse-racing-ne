import { BadRequestException } from '@nestjs/common';
import { assertTrainableHorse } from './training.policy';

describe('training policy', () => {
  describe('assertTrainableHorse', () => {
    it('rejects a reference horse', () => {
      expect(() => assertTrainableHorse(true)).toThrow(BadRequestException);
    });

    it('accepts a club horse', () => {
      expect(() => assertTrainableHorse(false)).not.toThrow();
    });
  });
});
