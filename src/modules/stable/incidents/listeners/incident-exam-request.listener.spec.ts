import type {
  ExamRequestHandledEvent,
  ExamRequestReopenedEvent,
} from '../../../medical/types/medical-events.types';
import { ExamRequestStatus } from '../../../medical/constant/exam-request.enum';
import { IncidentsService } from '../services/incidents.service';
import { IncidentExamRequestListener } from './incident-exam-request.listener';

describe('IncidentExamRequestListener', () => {
  let incidents: {
    resolveFromExam: jest.Mock;
    reopenFromExam: jest.Mock;
  };
  let listener: IncidentExamRequestListener;

  beforeEach(() => {
    incidents = {
      resolveFromExam: jest.fn().mockResolvedValue(undefined),
      reopenFromExam: jest.fn().mockResolvedValue(undefined),
    };
    listener = new IncidentExamRequestListener(
      incidents as unknown as IncidentsService,
    );
  });

  it('forwards completed exam events so the incident can be resolved', async () => {
    const event: ExamRequestHandledEvent = {
      eventId: 'event-1',
      horseId: 'horse-1',
      requestId: 'exam-1',
      requestedBy: null,
      incidentId: 'incident-1',
      outcome: ExamRequestStatus.EXAMINED,
      description: 'Ngựa bị đau chân',
      dismissReason: null,
      handledBy: 'vet-1',
      handledAt: '2026-11-08T01:00:00.000Z',
    };

    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(incidents.resolveFromExam).toHaveBeenCalledWith(event);
  });

  it('forwards reopened exam events so the incident can be reopened', async () => {
    const event: ExamRequestReopenedEvent = {
      eventId: 'event-2',
      horseId: 'horse-1',
      requestId: 'exam-1',
      incidentId: 'incident-1',
      reopenedBy: 'vet-1',
      reason: 'Buổi khám đã hủy',
    };

    await expect(listener.handleReopened(event)).resolves.toBeUndefined();
    expect(incidents.reopenFromExam).toHaveBeenCalledWith(event);
  });

  it('propagates a service error so the outbox can retry delivery', async () => {
    const error = new Error('temporary failure');
    incidents.resolveFromExam.mockRejectedValue(error);
    const event = {
      eventId: 'event-3',
      horseId: 'horse-1',
      requestId: 'exam-1',
      requestedBy: null,
      incidentId: 'incident-1',
      outcome: ExamRequestStatus.DISMISSED,
      description: 'Ngựa bị đau chân',
      dismissReason: 'Không cần khám',
      handledBy: 'vet-1',
      handledAt: '2026-11-08T01:00:00.000Z',
    } satisfies ExamRequestHandledEvent;

    await expect(listener.handle(event)).rejects.toBe(error);
  });
});
