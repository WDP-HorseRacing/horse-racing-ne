import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { MedicalRepository } from '../repositories/medical.repository';
import { MedicalService } from './medical.service';

jest.mock('../../horses/utils/horse-access');
const findReadableHorseMock = jest.mocked(findReadableHorse);

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('MedicalService.listRecords', () => {
  let repository: {
    listRecordsByHorse: jest.Mock;
    listPrescriptions: jest.Mock;
    listInjuries: jest.Mock;
  };
  let managerQuery: jest.Mock;
  let service: MedicalService;

  beforeEach(() => {
    repository = {
      listRecordsByHorse: jest.fn().mockResolvedValue([
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
      listPrescriptions: jest.fn().mockResolvedValue([
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
      listInjuries: jest.fn().mockResolvedValue([
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
    findReadableHorseMock.mockReset();
    findReadableHorseMock.mockResolvedValue({ id: 'h1' } as never);
    managerQuery = jest.fn().mockResolvedValue([]);
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
        query: managerQuery,
      },
    };
    service = new MedicalService(
      repository as unknown as MedicalRepository,
      dataSource as unknown as DataSource,
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

  it('gives a head trainer the full record of a horse in their barn', async () => {
    managerQuery.mockResolvedValue([{ '?column?': 1 }]);
    const [record] = await service.listRecords(
      actorWith(UserRole.HEAD_TRAINER),
      'h1',
    );
    expect(record.prescriptions[0].dosage).toBe('2 g');
  });

  it('forbids a head trainer from a horse outside their barn', async () => {
    await expect(
      service.listRecords(actorWith(UserRole.HEAD_TRAINER), 'h1'),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.listRecordsByHorse).not.toHaveBeenCalled();
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
    findReadableHorseMock.mockRejectedValue(new NotFoundException());
    await expect(
      service.listRecords(actorWith(UserRole.HORSE_OWNER), 'h1'),
    ).rejects.toThrow(NotFoundException);
    expect(repository.listRecordsByHorse).not.toHaveBeenCalled();
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
      findReadableHorseMock.mockRejectedValue(new NotFoundException());
      await expect(
        service.listInjuries(actorWith(UserRole.HORSE_OWNER), 'h1'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.listInjuries).not.toHaveBeenCalled();
    });

    it('forbids a head trainer from a horse outside their barn', async () => {
      await expect(
        service.listInjuries(actorWith(UserRole.HEAD_TRAINER), 'h1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
