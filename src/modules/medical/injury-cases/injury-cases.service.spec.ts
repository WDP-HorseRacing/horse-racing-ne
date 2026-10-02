import { NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryCasesService } from './injury-cases.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('InjuryCasesService.listInjuries', () => {
  let injuries: { find: jest.Mock };
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let service: InjuryCasesService;

  beforeEach(() => {
    injuries = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'i1',
          medicalRecordId: 'r1',
          bodyRegion: 'Chân trước trái',
          position: null,
          injuryType: 'Viêm gân',
          recoveryStatus: 'RECOVERING',
          notes: 'Chườm lạnh 2 lần/ngày',
          medicalRecord: {
            examDate: new Date('2026-09-20T08:00:00Z'),
            caseId: 'case-1',
          },
        },
      ]),
    };
    horseAccess = { findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }) };
    service = new InjuryCasesService(
      horseAccess as unknown as HorseAccessService,
      { manager: injuries } as unknown as DataSource,
    );
  });

  it('gives a horse owner the full injury marker, notes included', async () => {
    const [injury] = await service.listInjuries(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(injury).toMatchObject({
      bodyRegion: 'Chân trước trái',
      notes: 'Chườm lạnh 2 lần/ngày',
    });
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
    await expect(
      service.listInjuries(actorWith(UserRole.HORSE_OWNER), 'h1'),
    ).rejects.toThrow(NotFoundException);
    expect(injuries.find).not.toHaveBeenCalled();
  });

  it('gives a head trainer the injuries of any readable horse in the club', async () => {
    const [injury] = await service.listInjuries(
      actorWith(UserRole.HEAD_TRAINER),
      'h1',
    );
    expect(injury).toMatchObject({ bodyRegion: 'Chân trước trái' });
  });

  it('excludes voided visits, orders by exam time and returns exam date and case', async () => {
    const [injury] = await service.listInjuries(
      actorWith(UserRole.VETERINARIAN),
      'h1',
    );
    expect(injuries.find).toHaveBeenCalledWith(InjuryMarkerEntity, {
      where: { medicalRecord: { horseId: 'h1', voidedAt: IsNull() } },
      relations: { medicalRecord: true },
      order: { medicalRecord: { examDate: 'ASC' }, createdAt: 'ASC' },
    });
    expect(injury).toMatchObject({
      caseId: 'case-1',
      examDate: new Date('2026-09-20T08:00:00Z'),
    });
  });
});
