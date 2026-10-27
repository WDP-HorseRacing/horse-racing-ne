import { ExamRequestStatus } from '../constants/exam-request.enum';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import {
  toExamRequestResponse,
  toPrescriptionResponse,
} from './medical.mapper';

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

describe('toExamRequestResponse', () => {
  it('returns the incident the request came from', () => {
    const request = Object.assign(new MedicalExamRequestEntity(), {
      id: 'q1',
      horseId: 'h1',
      horse: { name: 'Gió' },
      requestedBy: 'g1',
      status: ExamRequestStatus.PENDING,
      handledBy: null,
      incidentId: 'i1',
    });
    expect(toExamRequestResponse(request).incidentId).toBe('i1');
  });
});
