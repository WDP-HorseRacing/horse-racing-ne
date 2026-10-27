import { BadRequestException, ConflictException } from '@nestjs/common';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import type { OwnershipTransferInput } from '../types/horse.types';
import { assertOwnershipTransfer } from './horse-ownership.policy';

describe('assertOwnershipTransfer', () => {
  const valid: OwnershipTransferInput = {
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    currentOwnerId: 'a',
    newOwnerId: 'b',
  };
  const check = (input: Partial<OwnershipTransferInput>) => () =>
    assertOwnershipTransfer({ ...valid, ...input });

  it('accepts an active or retired horse with an owner', () => {
    expect(check({})).not.toThrow();
    expect(
      check({ lifecycleStatus: HorseLifecycleStatus.RETIRED }),
    ).not.toThrow();
  });

  it('rejects a transferred or deceased horse with 409', () => {
    for (const lifecycleStatus of [
      HorseLifecycleStatus.TRANSFERRED,
      HorseLifecycleStatus.DECEASED,
    ]) {
      expect(check({ lifecycleStatus })).toThrow(
        new ConflictException('Chỉ chuyển chủ được cho ngựa đang ở câu lạc bộ'),
      );
    }
  });

  it('rejects a horse without an owner with 409', () => {
    expect(check({ currentOwnerId: null })).toThrow(
      new ConflictException(
        'Ngựa chưa có chủ sở hữu, dùng Gán chủ thay cho chuyển nhượng',
      ),
    );
  });

  it('rejects the current owner as the new owner on the newOwnerId field', () => {
    const message = 'Chủ mới trùng với chủ sở hữu hiện tại';
    expect(check({ newOwnerId: 'a' })).toThrow(
      new BadRequestException(message),
    );
    try {
      check({ newOwnerId: 'a' })();
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual({
        message,
        errors: [{ field: 'newOwnerId', message }],
      });
    }
  });
});
