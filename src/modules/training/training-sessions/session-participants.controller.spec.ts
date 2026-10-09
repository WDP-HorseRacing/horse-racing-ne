import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { TrialResultsController } from '../time-trials/trial-results.controller';
import { SessionParticipantsController } from './session-participants.controller';

function rolesOf(
  controller: { prototype: object },
  method: string,
): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    controller.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('SessionParticipantsController access', () => {
  it.each(['checkIn', 'absent', 'ready'])(
    'cho Groom được giao dắt ngựa gọi %s',
    (method) => {
      expect(rolesOf(SessionParticipantsController, method)).toEqual([
        UserRole.GROOM,
        UserRole.HEAD_TRAINER,
      ]);
    },
  );

  it.each(['start', 'complete'])('chỉ Head Trainer được gọi %s', (method) => {
    const roles = rolesOf(SessionParticipantsController, method);
    expect(roles).toEqual([UserRole.HEAD_TRAINER]);
    expect(roles).not.toContain(UserRole.GROOM);
  });
});

describe('TrialResultsController access', () => {
  it('chỉ Head Trainer được ghi kết quả chạy thử', () => {
    const roles = rolesOf(TrialResultsController, 'create');
    expect(roles).toEqual([UserRole.HEAD_TRAINER]);
    expect(roles).not.toContain(UserRole.GROOM);
  });
});
