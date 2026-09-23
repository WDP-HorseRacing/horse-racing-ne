import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { StallsController } from './stalls.controller';

function handlerOf(method: keyof StallsController): object {
  return Object.getOwnPropertyDescriptor(StallsController.prototype, method)
    ?.value as object;
}

describe('StallsController', () => {
  describe('endAssignment', () => {
    it('is open to the head trainer only, not the club manager', () => {
      expect(
        Reflect.getMetadata(ACCESS_KEY, handlerOf('endAssignment')),
      ).toEqual([UserRole.HEAD_TRAINER]);
    });

    it('answers 200 like the Swagger response', () => {
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('endAssignment')),
      ).toBe(HttpStatus.OK);
    });
  });
});
