import { ConflictException } from '@nestjs/common';
import { ExamRequestStatus } from '../../medical/constants/exam-request.enum';
import { IncidentStatus } from '../constants/incident-status.enum';
import {
  assertIncidentNotReferred,
  assertIncidentOpen,
  assertIncidentResolvable,
} from './incident.policy';

describe('incident policy', () => {
  it('only acts on an open incident', () => {
    expect(() => assertIncidentOpen(IncidentStatus.OPEN)).not.toThrow();
    expect(() => assertIncidentOpen(IncidentStatus.RESOLVED)).toThrow(
      ConflictException,
    );
  });

  it('refers an incident to a vet only once', () => {
    expect(() => assertIncidentNotReferred(false)).not.toThrow();
    expect(() => assertIncidentNotReferred(true)).toThrow(ConflictException);
  });

  it.each([null, ExamRequestStatus.EXAMINED, ExamRequestStatus.DISMISSED])(
    'resolves when the exam request is %s',
    (status) => {
      expect(() => assertIncidentResolvable(status)).not.toThrow();
    },
  );

  it('waits for the vet on a pending exam request', () => {
    expect(() => assertIncidentResolvable(ExamRequestStatus.PENDING)).toThrow(
      ConflictException,
    );
  });
});
