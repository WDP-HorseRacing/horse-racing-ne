import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { MedicalRecordsService } from './medical-records.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('MedicalRecordsService.listRecords', () => {
  let records: { find: jest.Mock; manager: object };
  let prescriptions: { find: jest.Mock };
  let injuries: { find: jest.Mock };
  let horseAccess: {
    currentUser: jest.Mock;
    findReadableHorse: jest.Mock;
    scopeOf: jest.Mock;
  };
  let ownerships: { periodsOfHorse: jest.Mock };
  let service: MedicalRecordsService;

  beforeEach(() => {
    records = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          examDate: new Date('2026-09-10T08:00:00Z'),
          diagnosis: 'Viêm gân chân trước trái',
          severity: 'MODERATE',
          resultingStatus: 'INJURED',
          vetId: 'vet-1',
          voidedAt: null,
          cost: '500000',
        },
      ]),
      manager: {},
    };
    prescriptions = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          medicalRecordId: 'r1',
          medicine: 'Phenylbutazone',
          dosage: '2 g',
          frequency: '2 lần/ngày',
          startDate: '2026-09-10',
          endDate: '2026-09-17',
        },
      ]),
    };
    injuries = { find: jest.fn().mockResolvedValue([]) };
    horseAccess = {
      currentUser: jest.fn().mockResolvedValue({ id: 'u1' }),
      findReadableHorse: jest.fn().mockResolvedValue({ id: 'h1' }),
      scopeOf: jest.fn((actor: Actor) =>
        actor.roles.includes(UserRole.HORSE_OWNER)
          ? { kind: 'OWNER', userId: 'u1' }
          : { kind: 'ALL' },
      ),
    };
    ownerships = {
      periodsOfHorse: jest.fn().mockResolvedValue([
        {
          ownerId: 'u0',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          endedAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          ownerId: 'u1',
          startedAt: new Date('2026-09-01T00:00:00Z'),
          endedAt: null,
        },
      ]),
    };
    service = new MedicalRecordsService(
      horseAccess as unknown as HorseAccessService,
      records as unknown as Repository<MedicalRecordEntity>,
      prescriptions as unknown as Repository<PrescriptionEntity>,
      injuries as unknown as Repository<InjuryMarkerEntity>,
      ownerships as unknown as HorseOwnershipService,
    );
  });

  it.each([UserRole.CLUB_MANAGER, UserRole.VETERINARIAN])(
    'gives %s the dosage and frequency',
    async (role) => {
      const [record] = await service.listRecords(actorWith(role), 'h1');
      expect(record.prescriptions[0]).toMatchObject({
        medicine: 'Phenylbutazone',
        dosage: '2 g',
        frequency: '2 lần/ngày',
      });
    },
  );

  it('gives a head trainer the full record of any readable horse in the club', async () => {
    const [record] = await service.listRecords(
      actorWith(UserRole.HEAD_TRAINER),
      'h1',
    );
    expect(record.prescriptions[0].dosage).toBe('2 g');
  });

  it('lets a club manager read the records of a deleted horse the access service returns', async () => {
    const manager = actorWith(UserRole.CLUB_MANAGER);
    horseAccess.findReadableHorse.mockResolvedValue({
      id: 'h1',
      deletedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const result = await service.listRecords(manager, 'h1');
    expect(horseAccess.findReadableHorse).toHaveBeenCalledWith(
      records.manager,
      manager,
      'u1',
      'h1',
    );
    expect(result).toHaveLength(1);
  });

  it('skips the prescription query when the horse has no record', async () => {
    records.find.mockResolvedValue([]);
    await expect(
      service.listRecords(actorWith(UserRole.VETERINARIAN), 'h1'),
    ).resolves.toEqual([]);
    expect(prescriptions.find).not.toHaveBeenCalled();
  });

  it('gives a horse owner the diagnosis and medicine without dosage and frequency', async () => {
    const [record] = await service.listRecords(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(record).toMatchObject({
      diagnosis: 'Viêm gân chân trước trái',
    });
    expect(record).not.toHaveProperty('severity');
    expect(record.prescriptions[0]).toMatchObject({
      medicine: 'Phenylbutazone',
      startDate: '2026-09-10',
      endDate: '2026-09-17',
    });
    expect(record.prescriptions[0]).not.toHaveProperty('dosage');
    expect(record.prescriptions[0]).not.toHaveProperty('frequency');
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.findReadableHorse.mockRejectedValue(new NotFoundException());
    await expect(
      service.listRecords(actorWith(UserRole.HORSE_OWNER), 'h1'),
    ).rejects.toThrow(NotFoundException);
    expect(records.find).not.toHaveBeenCalled();
  });

  describe('getRecord', () => {
    it('answers not found when the visit does not exist', async () => {
      (records as { findOne?: jest.Mock }).findOne = jest
        .fn()
        .mockResolvedValue(null);
      await expect(
        service.getRecord(actorWith(UserRole.VETERINARIAN), 'r404'),
      ).rejects.toThrow(NotFoundException);
      expect(horseAccess.findReadableHorse).not.toHaveBeenCalled();
    });

    it('answers not found when the horse of the visit is outside the caller scope', async () => {
      (records as { findOne?: jest.Mock }).findOne = jest
        .fn()
        .mockResolvedValue({ id: 'r1', horseId: 'h9' });
      horseAccess.findReadableHorse.mockRejectedValue(new NotFoundException());
      await expect(
        service.getRecord(actorWith(UserRole.HORSE_OWNER), 'r1'),
      ).rejects.toThrow(NotFoundException);
      expect(prescriptions.find).not.toHaveBeenCalled();
    });

    it('returns the visit with its injuries', async () => {
      (records as { findOne?: jest.Mock }).findOne = jest
        .fn()
        .mockResolvedValue({
          id: 'r1',
          horseId: 'h1',
          examDate: new Date('2026-09-10T08:00:00Z'),
          cost: '0',
        });
      injuries.find.mockResolvedValue([
        { id: 'i1', medicalRecordId: 'r1', bodyRegion: 'LEFT_FRONT_LEG' },
      ]);
      const visit = await service.getRecord(
        actorWith(UserRole.HEAD_TRAINER),
        'r1',
      );
      expect(horseAccess.findReadableHorse).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'u1',
        'h1',
      );
      expect(visit.injuries).toHaveLength(1);
      expect(visit).not.toHaveProperty('cost');
    });
  });

  describe('cost', () => {
    it.each([UserRole.CLUB_MANAGER, UserRole.VETERINARIAN])(
      'gives %s the cost of every visit',
      async (role) => {
        const [record] = await service.listRecords(actorWith(role), 'h1');
        expect(record).toMatchObject({ cost: 500000, costHidden: false });
        expect(ownerships.periodsOfHorse).not.toHaveBeenCalled();
      },
    );

    it('gives a head trainer no cost key', async () => {
      const [record] = await service.listRecords(
        actorWith(UserRole.HEAD_TRAINER),
        'h1',
      );
      expect(record).not.toHaveProperty('cost');
      expect(record).not.toHaveProperty('costHidden');
    });

    it('gives a horse owner the cost of a visit in their period right away, even in an open case', async () => {
      const [record] = await service.listRecords(
        actorWith(UserRole.HORSE_OWNER),
        'h1',
      );
      expect(record).toMatchObject({ cost: 500000, costHidden: false });
    });

    it('hides from a horse owner the cost of a visit in the period of another owner', async () => {
      records.find.mockResolvedValue([
        {
          id: 'r0',
          examDate: new Date('2026-08-31T23:59:00Z'),
          cost: '700000',
          voidedAt: null,
        },
      ]);
      const [record] = await service.listRecords(
        actorWith(UserRole.HORSE_OWNER),
        'h1',
      );
      expect(record).toMatchObject({ cost: null, costHidden: true });
    });
  });
});

describe('MedicalRecordsService.getCareInstructions', () => {
  let latest: Record<string, unknown> | null;
  let groomAssigned: boolean;
  let records: { findOne: jest.Mock };
  let horseAccess: {
    findReadableHorseForActor: jest.Mock;
    currentUser: jest.Mock;
    isGroomAssigned: jest.Mock;
  };
  let service: MedicalRecordsService;

  beforeEach(() => {
    latest = {
      id: 'r2',
      examDate: new Date('2026-09-20T08:00:00Z'),
      careInstructions:
        'Chườm lạnh chân trước trái 2 lần/ngày, không chạy nhanh',
    };
    groomAssigned = true;
    records = { findOne: jest.fn(() => Promise.resolve(latest)) };
    horseAccess = {
      findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }),
      currentUser: jest.fn().mockResolvedValue({ id: 'groom-1' }),
      isGroomAssigned: jest.fn(() => Promise.resolve(groomAssigned)),
    };
    service = new MedicalRecordsService(
      horseAccess as unknown as HorseAccessService,
      records as unknown as Repository<MedicalRecordEntity>,
      {} as Repository<PrescriptionEntity>,
      {} as Repository<InjuryMarkerEntity>,
      {} as HorseOwnershipService,
    );
  });

  it('gives the assigned groom the note of the latest visit that was not voided', async () => {
    await expect(
      service.getCareInstructions(actorWith(UserRole.GROOM), 'h1'),
    ).resolves.toEqual({
      horseId: 'h1',
      current: {
        careInstructions:
          'Chườm lạnh chân trước trái 2 lần/ngày, không chạy nhanh',
        examDate: new Date('2026-09-20T08:00:00Z'),
        medicalRecordId: 'r2',
      },
    });
    expect(records.findOne).toHaveBeenCalledWith({
      where: { horseId: 'h1', voidedAt: expect.anything() as unknown },
      order: { examDate: 'DESC' },
    });
    expect(horseAccess.isGroomAssigned).toHaveBeenCalledWith('h1', 'groom-1');
  });

  it('rejects a groom who does not look after the horse with 403', async () => {
    groomAssigned = false;
    await expect(
      service.getCareInstructions(actorWith(UserRole.GROOM), 'h1'),
    ).rejects.toThrow(ForbiddenException);
    expect(records.findOne).not.toHaveBeenCalled();
  });

  it('answers 404 for a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
    await expect(
      service.getCareInstructions(actorWith(UserRole.GROOM), 'h9'),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['the horse has never been examined', null],
    [
      'the latest visit left the note empty',
      { id: 'r3', examDate: new Date(), careInstructions: null },
    ],
  ])('has no current note when %s', async (_label, row) => {
    latest = row;
    await expect(
      service.getCareInstructions(actorWith(UserRole.GROOM), 'h1'),
    ).resolves.toEqual({ horseId: 'h1', current: null });
  });

  it('does not check the groom assignment for a head trainer', async () => {
    await service.getCareInstructions(actorWith(UserRole.HEAD_TRAINER), 'h1');
    expect(horseAccess.isGroomAssigned).not.toHaveBeenCalled();
  });
});
