import { toHorseEnrollmentResponse } from './horse-enrollment.mapper';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';

describe('horse enrollment mapper', () => {
  it('exposes classId from the canonical entity field', () => {
    const classId = '11111111-1111-4111-8111-111111111111';
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      classId,
      horseId: '33333333-3333-4333-8333-333333333333',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      leftAt: null,
      status: HorseEnrollmentStatus.ACTIVE,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as HorseEnrollmentEntity;

    expect(toHorseEnrollmentResponse(row).classId).toBe(classId);
  });
});
