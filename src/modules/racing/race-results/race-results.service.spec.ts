import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { RaceStatus } from '../constants/race-status.enum';
import { RegistrationStatus } from '../constants/registration-status.enum';
import { Repository } from 'typeorm';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceResultsService } from './race-results.service';

const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

describe('RaceResultsService.listHorseResults', () => {
  let horseAccess: { findReadable: jest.Mock };
  let repository: { find: jest.Mock };
  let service: RaceResultsService;

  beforeEach(() => {
    horseAccess = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      find: jest.fn().mockResolvedValue([
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
    service = new RaceResultsService(
      repository as unknown as Repository<RaceRegistrationEntity>,
      horseAccess as unknown as HorseAccessService,
    );
  });

  it('maps each registration of a readable horse to a race result row', async () => {
    const rows = await service.listHorseResults(owner, 'h1');

    expect(horseAccess.findReadable).toHaveBeenCalledWith(owner, 'h1');
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { horseId: 'h1' } }),
    );
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
    expect(repository.find).not.toHaveBeenCalled();
  });
});
