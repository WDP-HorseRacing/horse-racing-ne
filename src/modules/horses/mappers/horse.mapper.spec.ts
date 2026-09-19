import { HorseGender } from '../constants/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import type { HorseCurrentStallRow } from '../types/horse.types';
import {
  toHorseDetailResponse,
  toHorseListItem,
  toOwnershipResponse,
} from './horse.mapper';

describe('horse mapper', () => {
  describe('toHorseListItem', () => {
    const location: HorseCurrentStallRow = {
      horseId: 'horse-1',
      stallId: 'stall-1',
      stallCode: 'A-01',
      barnId: 'barn-1',
      barnName: 'Barn A',
    };

    const makeHorse = (overrides: Partial<HorseEntity> = {}): HorseEntity =>
      Object.assign(new HorseEntity(), {
        id: 'horse-1',
        name: 'Thunder',
        gender: HorseGender.MALE,
        breed: 'Thoroughbred',
        color: 'Bay',
        raceAptitude: RaceAptitude.SPRINTER,
        dateOfBirth: '2020-01-01',
        microchipId: 'chip-1',
        mediaId: null,
        sireId: null,
        damId: null,
        isReference: false,
        healthStatus: HorseHealthStatus.ELIGIBLE,
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        ...overrides,
      });

    it('maps the base horse fields', () => {
      const item = toHorseListItem(makeHorse(), location, false);

      expect(item).toMatchObject({
        id: 'horse-1',
        name: 'Thunder',
        microchipId: 'chip-1',
        healthStatus: HorseHealthStatus.ELIGIBLE,
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      });
    });

    it('exposes the lifecycle reason but hides the deleted reason', () => {
      const changedAt = new Date('2026-09-20T00:00:00Z');
      const item = toHorseListItem(
        makeHorse({
          lifecycleReason: 'Giải nghệ',
          lifecycleChangedAt: changedAt,
          deletedReason: 'Tạo nhầm',
        }),
        location,
        false,
      );

      expect(item.lifecycleReason).toBe('Giải nghệ');
      expect(item.lifecycleChangedAt).toEqual(changedAt);
      expect(item).not.toHaveProperty('deletedReason');
    });

    it('maps the stall with its barn from the location', () => {
      const item = toHorseListItem(makeHorse(), location, false);

      expect(item.stall).toEqual({
        id: 'stall-1',
        code: 'A-01',
        barn: { id: 'barn-1', name: 'Barn A' },
      });
    });

    it('returns a null stall when the horse has no stall', () => {
      const item = toHorseListItem(makeHorse(), null, false);

      expect(item.stall).toBeNull();
    });

    it('allows race registration for an active, eligible, unlocked horse', () => {
      expect(
        toHorseListItem(makeHorse(), location, false).canRegisterRace,
      ).toBe(true);
    });

    it('blocks race registration when a training lock is active', () => {
      expect(toHorseListItem(makeHorse(), location, true).canRegisterRace).toBe(
        false,
      );
    });

    it('blocks race registration when the horse is under observation', () => {
      const horse = makeHorse({
        healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
      });

      expect(toHorseListItem(horse, location, false).canRegisterRace).toBe(
        false,
      );
    });

    it('blocks race registration when the horse is retired', () => {
      const horse = makeHorse({
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
      });

      expect(toHorseListItem(horse, location, false).canRegisterRace).toBe(
        false,
      );
    });

    it('blocks race registration for a reference horse', () => {
      const horse = makeHorse({ isReference: true });

      expect(toHorseListItem(horse, null, false).canRegisterRace).toBe(false);
    });
  });
});

describe('toOwnershipResponse', () => {
  const ownership = Object.assign(new HorseOwnershipEntity(), {
    id: 'ow1',
    horseId: 'h1',
    ownerId: 'o1',
    owner: { fullName: 'Nguyễn Văn A', email: 'a@club.vn' },
    percentage: '60.00',
    startAt: new Date('2026-09-19T00:00:00+07:00'),
    endAt: null,
    isRepresentative: true,
  });

  it('returns the representative flag', () => {
    expect(toOwnershipResponse(ownership, false)).toMatchObject({
      ownerName: 'Nguyễn Văn A',
      isRepresentative: true,
    });
  });

  it('adds the owner email when the caller may see it', () => {
    expect(toOwnershipResponse(ownership, true).ownerEmail).toBe('a@club.vn');
  });

  it('leaves out the ownerEmail key when the caller may not see it', () => {
    expect(toOwnershipResponse(ownership, false)).not.toHaveProperty(
      'ownerEmail',
    );
  });
});

describe('toHorseDetailResponse', () => {
  const horse = Object.assign(new HorseEntity(), {
    id: 'h1',
    name: 'Gió Bắc',
    sireId: 'sire-1',
    damId: 'dam-1',
    isReference: false,
  });
  const parts = {
    stall: {
      horseId: 'h1',
      stallId: 's1',
      stallCode: 'A-01',
      barnId: 'b1',
      barnName: 'Barn A',
    },
    groom: { id: 'groom-1', fullName: 'Trần B' },
    representativeOwner: null,
    latestMeasurements: [],
    activeTrainingLock: false,
  };

  it('adds the parents and representative owner when visible', () => {
    const detail = toHorseDetailResponse(horse, parts, {
      includeParents: true,
      includeRepresentativeOwner: true,
    });
    expect(detail).toMatchObject({
      sireId: 'sire-1',
      damId: 'dam-1',
      representativeOwner: null,
      stall: { id: 's1', code: 'A-01', barn: { id: 'b1', name: 'Barn A' } },
    });
  });

  it('leaves out the hidden keys instead of sending null', () => {
    const detail = toHorseDetailResponse(horse, parts, {
      includeParents: false,
      includeRepresentativeOwner: false,
    });
    expect(detail).not.toHaveProperty('sireId');
    expect(detail).not.toHaveProperty('damId');
    expect(detail).not.toHaveProperty('representativeOwner');
  });
});
