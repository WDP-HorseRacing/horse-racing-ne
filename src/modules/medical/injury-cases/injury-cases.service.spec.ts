import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
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
  let horseAccess: { findReadable: jest.Mock };
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
        },
      ]),
    };
    horseAccess = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    service = new InjuryCasesService(
      horseAccess as unknown as HorseAccessService,
      injuries as unknown as Repository<InjuryMarkerEntity>,
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
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());
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
});
