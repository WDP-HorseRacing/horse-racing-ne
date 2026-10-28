import { RaceStatus } from '../constants/race-status.enum';
import { RegistrationStatus } from '../constants/registration-status.enum';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { toHorseRaceResultResponse } from './racing.mapper';

describe('toHorseRaceResultResponse', () => {
  it('keeps placing and time null for a race without result', () => {
    const registration = {
      id: 'reg-1',
      status: RegistrationStatus.PROPOSED,
      placing: null,
      timeSeconds: null,
      race: {
        id: 'race-1',
        name: 'Cúp Mùa Thu',
        scheduledAt: new Date('2026-10-01T08:00:00Z'),
        status: RaceStatus.OPEN,
      },
    } as unknown as RaceRegistrationEntity;

    expect(toHorseRaceResultResponse(registration)).toEqual({
      registrationId: 'reg-1',
      raceId: 'race-1',
      raceName: 'Cúp Mùa Thu',
      scheduledAt: new Date('2026-10-01T08:00:00Z'),
      raceStatus: RaceStatus.OPEN,
      registrationStatus: RegistrationStatus.PROPOSED,
      placing: null,
      timeSeconds: null,
    });
  });
});
