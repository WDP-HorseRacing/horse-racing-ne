import { UserRole } from '../../../../common/enums/role.enum';
import { HorseHealthStatus } from '../../../horses/enums/horse-status.enum';
import { CareScheduleType } from '../../../medical/constants/care-schedule.enum';
import { NotificationPriority } from '../../constants/notification-priority.enum';
import { NotificationResourceType } from '../../constants/notification-resource-type.enum';
import { NotificationType } from '../../constants/notification-type.enum';
import { NotificationRecipientsRepository } from '../repositories/notification-recipients.repository';
import type { NotificationDraft } from '../../types/notification.types';
import { MedicalNotificationsService } from './medical-notifications.service';
import { NotificationsService } from './notifications.service';

describe('MedicalNotificationsService', () => {
  let recipients: {
    findHorseMedicalContact: jest.Mock;
    findActiveUserIdsByRole: jest.Mock;
  };
  let notifications: { send: jest.Mock };
  let service: MedicalNotificationsService;

  const sentDraft = () =>
    (notifications.send.mock.calls as Array<[NotificationDraft]>)[0][0];

  beforeEach(() => {
    recipients = {
      findHorseMedicalContact: jest.fn().mockResolvedValue({
        horseName: 'Winx',
        headTrainerId: 'ht-1',
        ownerId: 'owner-1',
      }),
      findActiveUserIdsByRole: jest.fn((role: UserRole) =>
        Promise.resolve(
          role === UserRole.VETERINARIAN ? ['vet-1', 'vet-2'] : ['cm-1'],
        ),
      ),
    };
    notifications = {
      send: jest.fn((draft: { recipientIds: string[] }) =>
        Promise.resolve(draft.recipientIds),
      ),
    };
    service = new MedicalNotificationsService(
      recipients as unknown as NotificationRecipientsRepository,
      notifications as unknown as NotificationsService,
    );
  });

  it('sends an urgent exam request to every veterinarian only', async () => {
    await service.notifyUrgentExamRequest({
      eventId: 'e1',
      horseId: 'h1',
      requestId: 'r1',
      description: 'Đi khập khiễng',
    });
    expect(sentDraft()).toMatchObject({
      eventId: 'e1',
      recipientIds: ['vet-1', 'vet-2'],
      priority: NotificationPriority.URGENT,
      resource: { type: NotificationResourceType.HORSE, id: 'h1' },
    });
  });

  it('sends a lock to the barn head trainer and club managers with HIGH priority', async () => {
    await service.notifyLockSet({
      eventId: 'e2',
      horseId: 'h1',
      lockId: 'l1',
      reason: 'Hồi phục sau viêm gân',
      expectedEnd: null,
    });
    expect(sentDraft()).toMatchObject({
      recipientIds: ['cm-1', 'ht-1'],
      priority: NotificationPriority.HIGH,
      resource: { type: NotificationResourceType.TRAINING_LOCK, id: 'l1' },
    });
  });

  it('skips the head trainer when the horse has no barn', async () => {
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Winx',
      headTrainerId: null,
      ownerId: 'owner-1',
    });
    await service.notifyLockReleased({
      eventId: 'e3',
      horseId: 'h1',
      lockId: 'l1',
      conclusion: 'Đã hồi phục',
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1']);
  });

  it.each([HorseHealthStatus.INJURED, HorseHealthStatus.QUARANTINED])(
    'warns the barn head trainer, club managers and the owner about a change to %s',
    async (to) => {
      await service.notifyHealthChanged({
        eventId: 'e4',
        horseId: 'h1',
        from: HorseHealthStatus.ELIGIBLE,
        to,
      });
      expect(sentDraft()).toMatchObject({
        recipientIds: ['cm-1', 'ht-1', 'owner-1'],
        priority: NotificationPriority.HIGH,
      });
    },
  );

  it('sends nothing when the horse becomes eligible again', async () => {
    await expect(
      service.notifyHealthChanged({
        eventId: 'e5',
        horseId: 'h1',
        from: HorseHealthStatus.INJURED,
        to: HorseHealthStatus.ELIGIBLE,
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('tells only the barn head trainer at NORMAL level when the horse goes under observation', async () => {
    await service.notifyHealthChanged({
      eventId: 'e5b',
      horseId: 'h1',
      from: HorseHealthStatus.ELIGIBLE,
      to: HorseHealthStatus.UNDER_OBSERVATION,
    });
    expect(sentDraft()).toMatchObject({
      eventId: 'e5b',
      recipientIds: ['ht-1'],
      type: NotificationType.INFO,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa Winx: Cần theo dõi',
      message:
        'Trạng thái sức khỏe của ngựa Winx chuyển từ Đủ điều kiện sang Cần theo dõi. Ngựa không được đua cho tới khi bác sĩ kết luận lại.',
    });
  });

  it('sends a closed case with its cost to the owner and club managers', async () => {
    await service.notifyCaseClosed({
      eventId: 'e6',
      horseId: 'h1',
      caseId: 'c1',
      totalCost: 1500000,
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1', 'owner-1']);
    expect(sentDraft().message).toContain('1.500.000');
    expect(sentDraft().resource).toEqual({
      type: NotificationResourceType.MEDICAL_CASE,
      id: 'c1',
    });
  });

  it('skips the owner when the horse has no active owner', async () => {
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Winx',
      headTrainerId: 'ht-1',
      ownerId: null,
    });
    await service.notifyCaseOpened({
      eventId: 'e7',
      horseId: 'h1',
      caseId: 'c1',
      initialDiagnosis: 'Viêm gân',
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1']);
  });

  it('sends an overdue checkup to veterinarians and club managers', async () => {
    await service.notifyCheckupOverdue({
      eventId: 'e8',
      horseId: 'h1',
      dueDate: '2026-09-15',
    });
    expect(sentDraft()).toMatchObject({
      recipientIds: ['vet-1', 'vet-2', 'cm-1'],
      priority: NotificationPriority.HIGH,
      resource: { type: NotificationResourceType.HORSE, id: 'h1' },
    });
  });

  it('sends a due care schedule to veterinarians and the assignee without duplicates', async () => {
    await service.notifyCareScheduleDue({
      eventId: 'e9',
      horseId: 'h1',
      scheduleId: 's1',
      type: CareScheduleType.FARRIER,
      dueDate: '2026-09-27',
      assigneeId: 'vet-1',
    });
    expect(sentDraft().recipientIds).toEqual(['vet-1', 'vet-2']);
    expect(sentDraft().title).toContain('kiểm tra móng');
  });

  it('skips the notification when the horse is missing', async () => {
    recipients.findHorseMedicalContact.mockResolvedValue(null);
    await expect(
      service.notifyCaseCostAdjusted({
        eventId: 'e10',
        horseId: 'h1',
        caseId: 'c1',
        fromCost: 15000000,
        toCost: 1500000,
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('tells club managers and the owner that a case opened by mistake was cancelled', async () => {
    await service.notifyCaseCancelled({
      eventId: 'e11',
      horseId: 'h1',
      caseId: 'c1',
      reason: 'Mở nhầm ngựa',
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1', 'owner-1']);
    expect(sentDraft().message).toContain('Mở nhầm ngựa');
  });

  it('prints the expected lock end on the club calendar day', async () => {
    await service.notifyLockSet({
      eventId: 'e12',
      horseId: 'h1',
      lockId: 'l1',
      reason: 'Nghỉ',
      expectedEnd: '2026-10-04T17:00:00.000Z',
    });
    expect(sentDraft().message).toContain('Dự kiến gỡ: 2026-10-05');
  });
});
