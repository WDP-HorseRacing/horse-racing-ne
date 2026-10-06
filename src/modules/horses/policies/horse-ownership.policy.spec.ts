import { BadRequestException, ConflictException } from '@nestjs/common';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import type { OwnershipTransferInput } from '../types/horse.types';
import { assertOwnershipTransfer } from './horse-ownership.policy';

describe('assertOwnershipTransfer', () => {
  const valid: OwnershipTransferInput = {
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    currentOwnerId: 'a',
    currentOwnerSince: '2026-03-01',
    newOwnerId: 'b',
    effectiveDate: '2026-06-01',
    today: '2026-10-06',
  };
  const check = (input: Partial<OwnershipTransferInput>) => () =>
    assertOwnershipTransfer({ ...valid, ...input });

  it('accepts an active or retired horse, today and the current owner start date', () => {
    expect(check({})).not.toThrow();
    expect(
      check({ lifecycleStatus: HorseLifecycleStatus.RETIRED }),
    ).not.toThrow();
    expect(check({ effectiveDate: '2026-10-06' })).not.toThrow();
    expect(check({ effectiveDate: '2026-03-01' })).not.toThrow();
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
    expect(check({ currentOwnerId: null, currentOwnerSince: null })).toThrow(
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

  it('rejects a future effective date', () => {
    expect(check({ effectiveDate: '2026-10-07' })).toThrow(
      new BadRequestException('Ngày hiệu lực không được ở tương lai'),
    );
  });

  it('rejects an effective date before the current owner started, with that date', () => {
    expect(check({ effectiveDate: '2026-02-28' })).toThrow(
      new BadRequestException(
        'Ngày hiệu lực không được trước ngày bắt đầu sở hữu của chủ hiện tại (01/03/2026)',
      ),
    );
  });
});
