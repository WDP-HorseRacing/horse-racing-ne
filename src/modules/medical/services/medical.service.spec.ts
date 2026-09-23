import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { MedicalService } from './medical.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('MedicalService.listRecords', () => {
  let records: { find: jest.Mock };
  let prescriptions: { find: jest.Mock };
  let injuries: { find: jest.Mock };
  let horseAccess: { findReadable: jest.Mock };
  let service: MedicalService;

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
        },
      ]),
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
    service = new MedicalService(
      horseAccess as unknown as HorseAccessService,
      records as unknown as Repository<MedicalRecordEntity>,
      prescriptions as unknown as Repository<PrescriptionEntity>,
      injuries as unknown as Repository<InjuryMarkerEntity>,
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
    horseAccess.findReadable.mockResolvedValue({
      id: 'h1',
      deletedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const result = await service.listRecords(manager, 'h1');
    expect(horseAccess.findReadable).toHaveBeenCalledWith(manager, 'h1');
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
      severity: 'MODERATE',
    });
    expect(record.prescriptions[0]).toMatchObject({
      medicine: 'Phenylbutazone',
      startDate: '2026-09-10',
      endDate: '2026-09-17',
    });
    expect(record.prescriptions[0]).not.toHaveProperty('dosage');
    expect(record.prescriptions[0]).not.toHaveProperty('frequency');
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());
    await expect(
      service.listRecords(actorWith(UserRole.HORSE_OWNER), 'h1'),
    ).rejects.toThrow(NotFoundException);
    expect(records.find).not.toHaveBeenCalled();
  });

  describe('listInjuries', () => {
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
});
