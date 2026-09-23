import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { RaceStatus } from '../constants/race-status.enum';
import { RegistrationStatus } from '../constants/registration-status.enum';
import { RacingRepository } from '../repositories/racing.repository';
import { RacingService } from './racing.service';

const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

describe('RacingService.listHorseResults', () => {
  let horseAccess: { findReadable: jest.Mock };
  let repository: { listResultsByHorse: jest.Mock };
  let service: RacingService;

  beforeEach(() => {
    horseAccess = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      listResultsByHorse: jest.fn().mockResolvedValue([
        {
          id: 'reg-1',
          status: RegistrationStatus.MANAGER_CONFIRMED,
          placing: 2,
          timeSeconds: '71.250',
          race: {
            id: 'race-1',
            name: 'Cúp Mùa Thu',
            scheduledAt: new Date('2026-09-20T08:00:00Z'),
            status: RaceStatus.COMPLETED,
          },
        },
      ]),
    };
    service = new RacingService(
      repository as unknown as RacingRepository,
      horseAccess as unknown as HorseAccessService,
    );
  });

  it('maps each registration of a readable horse to a race result row', async () => {
    const rows = await service.listHorseResults(owner, 'h1');

    expect(horseAccess.findReadable).toHaveBeenCalledWith(owner, 'h1');
    expect(repository.listResultsByHorse).toHaveBeenCalledWith('h1');
    expect(rows).toEqual([
      {
        registrationId: 'reg-1',
        raceId: 'race-1',
        raceName: 'Cúp Mùa Thu',
        scheduledAt: new Date('2026-09-20T08:00:00Z'),
        raceStatus: RaceStatus.COMPLETED,
        registrationStatus: RegistrationStatus.MANAGER_CONFIRMED,
        placing: 2,
        timeSeconds: '71.250',
      },
    ]);
  });

  it('answers not found for a horse outside the caller scope without reading results', async () => {
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());

    await expect(service.listHorseResults(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listResultsByHorse).not.toHaveBeenCalled();
  });
});
