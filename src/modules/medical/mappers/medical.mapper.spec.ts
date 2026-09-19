import { PrescriptionEntity } from '../entities/prescription.entity';
import { toPrescriptionResponse } from './medical.mapper';

describe('toPrescriptionResponse', () => {
  const prescription = Object.assign(new PrescriptionEntity(), {
    id: 'p1',
    medicalRecordId: 'r1',
    medicine: 'Phenylbutazone',
    dosage: '2 g',
    frequency: '2 lần/ngày',
    startDate: '2026-09-10',
    endDate: null,
  });

  it('adds the dosage and frequency when the caller may see them', () => {
    expect(toPrescriptionResponse(prescription, true)).toMatchObject({
      dosage: '2 g',
      frequency: '2 lần/ngày',
    });
  });

  it('leaves out the dosage and frequency keys otherwise', () => {
    const response = toPrescriptionResponse(prescription, false);
    expect(response).not.toHaveProperty('dosage');
    expect(response).not.toHaveProperty('frequency');
    expect(response.medicine).toBe('Phenylbutazone');
  });
});
