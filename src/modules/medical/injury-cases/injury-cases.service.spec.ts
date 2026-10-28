import { NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryCasesService } from './injury-cases.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

const injury = (id: string) => ({
  id,
  horseId: 'h1',
  bodyRegion: 'LEFT_FRONT_LEG',
  injuryType: 'SPRAIN',
  position: { x: 0.1, y: 0.6, z: 0 },
  firstMedicalRecordId: 'r1',
});

const marker = (
  injuryId: string,
  recordId: string,
  examDate: string,
  recoveryStatus: RecoveryStatus,
) => ({
  id: `${injuryId}-${recordId}`,
  medicalRecordId: recordId,
  injuryId,
  injury: injury(injuryId),
  recoveryStatus,
  notes: 'Chườm lạnh 2 lần/ngày',
  medicalRecord: { examDate: new Date(examDate), caseId: 'case-1' },
});

describe('InjuryCasesService.listInjuries', () => {
  let manager: { find: jest.Mock };
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let service: InjuryCasesService;

  beforeEach(() => {
    manager = {
      find: jest
        .fn()
        .mockResolvedValue([
          marker('i1', 'r1', '2026-09-20T08:00:00Z', RecoveryStatus.ACUTE),
          marker('i2', 'r1', '2026-09-20T08:00:00Z', RecoveryStatus.ACUTE),
          marker('i1', 'r2', '2026-09-25T08:00:00Z', RecoveryStatus.HEALED),
        ]),
    };
    horseAccess = {
      findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }),
    };
    service = new InjuryCasesService(
      horseAccess as unknown as HorseAccessService,
      { manager } as unknown as DataSource,
    );
  });

  it('reads only visits not voided of the horse, ordered by exam time', async () => {
    await service.listInjuries(actorWith(UserRole.VETERINARIAN), 'h1', {});
    expect(manager.find).toHaveBeenCalledWith(InjuryMarkerEntity, {
      where: {
        injury: { horseId: 'h1' },
        medicalRecord: { voidedAt: IsNull() },
      },
      relations: { medicalRecord: true, injury: true },
      order: {
        medicalRecord: { examDate: 'ASC' },
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  });

  it('gives a horse owner each injury with its history and current status, notes included', async () => {
    const injuries = await service.listInjuries(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
      {},
    );
    expect(injuries.map((item) => item.id)).toEqual(['i1', 'i2']);
    expect(injuries[0]).toMatchObject({
      currentRecoveryStatus: RecoveryStatus.HEALED,
      firstExamDate: new Date('2026-09-20T08:00:00Z'),
      history: [
        { medicalRecordId: 'r1', recoveryStatus: RecoveryStatus.ACUTE },
        {
          medicalRecordId: 'r2',
          recoveryStatus: RecoveryStatus.HEALED,
          caseId: 'case-1',
          notes: 'Chườm lạnh 2 lần/ngày',
        },
      ],
    });
  });

  it('keeps only injuries not healed when asked', async () => {
    const injuries = await service.listInjuries(
      actorWith(UserRole.HEAD_TRAINER),
      'h1',
      { unhealedOnly: true },
    );
    expect(injuries.map((item) => item.id)).toEqual(['i2']);
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(
      new NotFoundException(),
    );
    await expect(
      service.listInjuries(actorWith(UserRole.HORSE_OWNER), 'h1', {}),
    ).rejects.toThrow(NotFoundException);
    expect(manager.find).not.toHaveBeenCalled();
  });
});
