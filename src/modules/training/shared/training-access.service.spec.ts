import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { TrainingAccessService } from './training-access.service';

describe('training access service', () => {
  const service = new TrainingAccessService(
    {} as DataSource,
    {} as HorseAccessService,
  );

  it('allows a club manager to manage any class', () => {
    const actor: Actor = { sub: 'manager', roles: [UserRole.CLUB_MANAGER] };
    expect(() => service.assertCanManageClass(actor, 'manager', null)).not.toThrow();
  });

  it('restricts a head trainer to their assigned class', () => {
    const actor: Actor = { sub: 'trainer', roles: [UserRole.HEAD_TRAINER] };
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', 'trainer'),
    ).not.toThrow();
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', 'other-trainer'),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanManageClass(actor, 'trainer', null),
    ).toThrow(ForbiddenException);
  });

  it('hides plan goals from a groom but not from management roles', () => {
    expect(service.seesPlanGoal({ sub: 'groom', roles: [UserRole.GROOM] })).toBe(
      false,
    );
    expect(
      service.seesPlanGoal({
        sub: 'manager',
        roles: [UserRole.CLUB_MANAGER],
      }),
    ).toBe(true);
  });
});
