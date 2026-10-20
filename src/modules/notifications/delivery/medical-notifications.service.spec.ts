import { UserRole } from '../../../common/enums/role.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleType } from '../../medical/constants/care-schedule.enum';
import { ExamRequestStatus } from '../../medical/constants/exam-request.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import type {
  HealthChangedEvent,
  MedicalCaseCancelledEvent,
  MedicalCaseClosedEvent,
  MedicalCaseOpenedEvent,
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../../medical/types/medical-events.types';
import type { NotificationDraft } from '../types/notification.types';
import { MedicalNotificationsService } from './medical-notifications.service';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('MedicalNotificationsService', () => {
  let recipients: {
    findHorseMedicalContact: jest.Mock;
    findActiveUserIdsByRole: jest.Mock;
    isActiveUserWithRole: jest.Mock;
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
        groomId: 'groom-1',
      }),
      findActiveUserIdsByRole: jest.fn((role: UserRole) =>
        Promise.resolve(
          role === UserRole.VETERINARIAN ? ['vet-1', 'vet-2'] : ['cm-1'],
        ),
      ),
      isActiveUserWithRole: jest.fn().mockResolvedValue(true),
    };
    notifications = {
      send: jest.fn((draft: { recipientIds: string[] }) =>
        Promise.resolve(draft.recipientIds),
      ),
    };
    service = new MedicalNotificationsService(
      recipients as unknown as NotificationRecipientsRepository,
      notifications as unknown as NotificationDeliveryService,
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
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'h1',
        horseId: 'h1',
      },
    });
  });

  it('sends a lock to the barn head trainer, club managers, the owner and the groom in charge with HIGH priority', async () => {
    await service.notifyLockSet({
      eventId: 'e2',
      horseId: 'h1',
      lockId: 'l1',
      reason: 'Hồi phục sau viêm gân',
      expectedEnd: null,
      ownerId: 'owner-1',
    });
    expect(sentDraft()).toMatchObject({
      recipientIds: ['cm-1', 'ht-1', 'owner-1', 'groom-1'],
      priority: NotificationPriority.HIGH,
      resource: {
        type: NotificationResourceType.TRAINING_LOCK,
        id: 'l1',
        horseId: 'h1',
      },
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
      ownerId: 'owner-1',
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1', 'owner-1']);
  });

  it.each([HorseHealthStatus.INJURED, HorseHealthStatus.QUARANTINED])(
    'warns the barn head trainer, club managers, the owner and the groom in charge about a change to %s',
    async (to) => {
      await service.notifyHealthChanged({
        eventId: 'e4',
        horseId: 'h1',
        from: HorseHealthStatus.ELIGIBLE,
        to,
        ownerId: 'owner-1',
      });
      expect(sentDraft()).toMatchObject({
        recipientIds: ['cm-1', 'ht-1', 'owner-1', 'groom-1'],
        priority: NotificationPriority.HIGH,
      });
    },
  );

  it('lists exposed horses to staff only and caps the names when a horse is quarantined', async () => {
    const exposedHorses = Array.from({ length: 12 }, (_, i) => ({
      horseId: `x${i}`,
      horseName: `Ngựa ${i}`,
      sameBarn: i !== 1,
      sameGroom: i <= 1,
    }));
    await service.notifyHealthChanged({
      eventId: 'e4q',
      horseId: 'h1',
      from: HorseHealthStatus.ELIGIBLE,
      to: HorseHealthStatus.QUARANTINED,
      exposedHorses,
      ownerId: 'owner-1',
    });
    const drafts = (
      notifications.send.mock.calls as Array<[NotificationDraft]>
    ).map(([draft]) => draft);
    const base =
      'Trạng thái sức khỏe của ngựa Winx chuyển từ Đủ điều kiện sang Cách ly. Ngựa không được tập và không được đua.';
    expect(drafts).toEqual([
      expect.objectContaining({
        eventId: 'e4q',
        recipientIds: ['cm-1', 'ht-1', 'groom-1'],
        priority: NotificationPriority.HIGH,
        message: `${base} Ngựa có thể đã tiếp xúc: Ngựa 0 (cùng khu, cùng Groom), Ngựa 1 (cùng Groom), Ngựa 2 (cùng khu), Ngựa 3 (cùng khu), Ngựa 4 (cùng khu), Ngựa 5 (cùng khu), Ngựa 6 (cùng khu), Ngựa 7 (cùng khu), Ngựa 8 (cùng khu), Ngựa 9 (cùng khu) và 2 con khác.`,
      }),
      expect.objectContaining({
        eventId: 'e4q',
        recipientIds: ['owner-1'],
        priority: NotificationPriority.HIGH,
        message: base,
      }),
    ]);
  });

  it('tells the owner and the groom in charge at NORMAL level when the horse becomes eligible again', async () => {
    await service.notifyHealthChanged({
      eventId: 'e5',
      horseId: 'h1',
      from: HorseHealthStatus.INJURED,
      to: HorseHealthStatus.ELIGIBLE,
      ownerId: 'owner-1',
    });
    expect(sentDraft()).toMatchObject({
      recipientIds: ['owner-1', 'groom-1'],
      priority: NotificationPriority.NORMAL,
      message:
        'Trạng thái sức khỏe của ngựa Winx chuyển từ Chấn thương sang Đủ điều kiện. Ngựa tập và đua lại được.',
    });
  });

  it('tells the barn head trainer, the owner and the groom in charge at NORMAL level when the horse goes under observation', async () => {
    await service.notifyHealthChanged({
      eventId: 'e5b',
      horseId: 'h1',
      from: HorseHealthStatus.ELIGIBLE,
      to: HorseHealthStatus.UNDER_OBSERVATION,
      ownerId: 'owner-1',
    });
    expect(sentDraft()).toMatchObject({
      eventId: 'e5b',
      recipientIds: ['ht-1', 'owner-1', 'groom-1'],
      category: NotificationCategory.HEALTH_STATUS,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa Winx: Cần theo dõi',
      message:
        'Trạng thái sức khỏe của ngựa Winx chuyển từ Đủ điều kiện sang Cần theo dõi. Ngựa không được đua cho tới khi bác sĩ kết luận lại.',
    });
  });

  it('sends club managers the cost of the whole case and the owner only their part', async () => {
    const sent = await service.notifyCaseClosed({
      eventId: 'e6',
      horseId: 'h1',
      caseId: 'c1',
      totalCost: 5000000,
      ownerId: 'owner-1',
      ownerCost: 2000000,
    });
    const drafts = (
      notifications.send.mock.calls as Array<[NotificationDraft]>
    ).map(([draft]) => draft);
    expect(drafts.map((draft) => [draft.recipientIds, draft.message])).toEqual([
      [['cm-1'], expect.stringContaining('5.000.000') as unknown],
      [['owner-1'], expect.stringContaining('2.000.000') as unknown],
    ]);
    expect(drafts.map((draft) => draft.eventId)).toEqual(['e6', 'e6']);
    expect(drafts[1].resource).toEqual({
      type: NotificationResourceType.MEDICAL_CASE,
      id: 'c1',
      horseId: 'h1',
    });
    expect(sent).toEqual(['cm-1', 'owner-1']);
  });

  it('sends a closed case only to club managers when the horse had no owner at closing', async () => {
    await service.notifyCaseClosed({
      eventId: 'e6',
      horseId: 'h1',
      caseId: 'c1',
      totalCost: 300000,
      ownerId: null,
      ownerCost: null,
    });
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(sentDraft().recipientIds).toEqual(['cm-1']);
  });

  it('skips the owner when the horse has no active owner', async () => {
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Winx',
      headTrainerId: 'ht-1',
      ownerId: null,
    });
    recipients.isActiveUserWithRole.mockResolvedValue(false);
    await service.notifyCaseOpened({
      eventId: 'e7',
      horseId: 'h1',
      caseId: 'c1',
      initialDiagnosis: 'Viêm gân',
      ownerId: 'owner-1',
    });
    expect(sentDraft().recipientIds).toEqual(['cm-1']);
  });

  it('sends a due checkup to veterinarians only at normal priority', async () => {
    await service.notifyCheckupDue({
      eventId: 'e7',
      horseId: 'h1',
      dueDate: '2026-10-31',
    });
    expect(sentDraft()).toMatchObject({
      eventId: 'e7',
      recipientIds: ['vet-1', 'vet-2'],
      category: NotificationCategory.CARE_REMINDER,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa Winx đến hạn khám định kỳ',
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'h1',
        horseId: 'h1',
      },
    });
    expect(sentDraft().message).toContain(
      'Winx đến hạn khám định kỳ ngày 31/10/2026',
    );
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
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'h1',
        horseId: 'h1',
      },
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

  it('sends an appointment-day reminder to every vet', async () => {
    await service.notifyCheckupAppointmentDue({
      eventId: 'e11',
      horseId: 'h1',
      appointmentId: 'a1',
      scheduledAt: '2026-09-27T02:00:00.000Z',
    });
    expect(sentDraft().recipientIds).toEqual(['vet-1', 'vet-2']);
    expect(sentDraft().message).toContain('09:00 ngày 27/09/2026');
  });

  it('skips the notification when the horse is missing', async () => {
    recipients.findHorseMedicalContact.mockResolvedValue(null);
    await expect(
      service.notifyVisitCostAdjusted({
        eventId: 'e10',
        horseId: 'h1',
        recordId: 'r1',
        caseId: 'c1',
        examDate: '2026-05-20T03:00:00.000Z',
        fromCost: 15000000,
        toCost: 1500000,
        costOwnerId: 'owner-1',
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  describe('notifyExamRequestHandled', () => {
    const handled = {
      eventId: 'e11',
      horseId: 'h1',
      requestId: 'r1',
      requestedBy: 'groom-2',
      description: 'Đi khập khiễng',
    };

    it('tells the requester that the vet examined the horse', async () => {
      await service.notifyExamRequestHandled({
        ...handled,
        outcome: ExamRequestStatus.EXAMINED,
        dismissReason: null,
      });
      expect(sentDraft()).toMatchObject({
        eventId: 'e11',
        recipientIds: ['groom-2'],
        category: NotificationCategory.EXAM_REQUEST,
        priority: NotificationPriority.NORMAL,
        title: 'Ngựa Winx đã được bác sĩ khám',
      });
    });

    it('tells the requester why the vet skipped the request', async () => {
      await service.notifyExamRequestHandled({
        ...handled,
        outcome: ExamRequestStatus.DISMISSED,
        dismissReason: 'Đã khám sáng nay',
      });
      expect(sentDraft()).toMatchObject({
        recipientIds: ['groom-2'],
        message:
          'Bác sĩ bỏ qua yêu cầu khám "Đi khập khiễng" của ngựa Winx. Lý do: Đã khám sáng nay',
      });
    });
  });

  describe('notifyVisitCostAdjusted', () => {
    const adjusted = (
      costOwnerId: string | null,
      caseId: string | null = 'c1',
    ) =>
      service.notifyVisitCostAdjusted({
        eventId: 'e20',
        horseId: 'h1',
        recordId: 'r1',
        caseId,
        examDate: '2026-05-19T18:00:00.000Z',
        fromCost: 15000000,
        toCost: 1500000,
        costOwnerId,
      });
    const caseResource = {
      type: NotificationResourceType.MEDICAL_CASE,
      id: 'c1',
      horseId: 'h1',
    };

    it('tells club managers and the current owner when the case is in their period', async () => {
      await expect(adjusted('owner-1')).resolves.toEqual(['cm-1', 'owner-1']);
      expect(notifications.send).toHaveBeenCalledTimes(1);
      expect(sentDraft()).toMatchObject({
        recipientIds: ['cm-1', 'owner-1'],
        resource: caseResource,
        message:
          'Chi phí buổi khám ngày 20/05/2026 của ngựa Winx được điều chỉnh từ 15.000.000 đ thành 1.500.000 đ.',
      });
    });

    it('points a visit outside any case to the horse', async () => {
      await adjusted('owner-1', null);
      expect(sentDraft().resource).toEqual({
        type: NotificationResourceType.HORSE,
        id: 'h1',
        horseId: 'h1',
      });
    });

    it('tells the past owner who bears the cost without a link, not the current owner', async () => {
      await expect(adjusted('owner-old')).resolves.toEqual([
        'cm-1',
        'owner-old',
      ]);
      expect(notifications.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          recipientIds: ['cm-1'],
          resource: caseResource,
        }),
      );
      expect(notifications.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          recipientIds: ['owner-old'],
          resource: null,
          title: 'Điều chỉnh chi phí khám ngựa Winx',
        }),
      );
      expect(recipients.isActiveUserWithRole).toHaveBeenCalledWith(
        'owner-old',
        UserRole.HORSE_OWNER,
      );
    });

    it('skips a past owner who is no longer active, and a case closed without an owner', async () => {
      recipients.isActiveUserWithRole.mockResolvedValue(false);
      await adjusted('owner-old');
      await adjusted(null);
      expect(notifications.send).toHaveBeenCalledTimes(2);
      for (const [draft] of notifications.send.mock.calls as Array<
        [NotificationDraft]
      >) {
        expect(draft.recipientIds).toEqual(['cm-1']);
      }
    });
  });

  it('tells club managers and the owner that a case opened by mistake was cancelled', async () => {
    await service.notifyCaseCancelled({
      eventId: 'e11',
      horseId: 'h1',
      caseId: 'c1',
      reason: 'Mở nhầm ngựa',
      ownerId: 'owner-1',
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
      ownerId: 'owner-1',
    });
    expect(sentDraft().message).toContain('Dự kiến gỡ: 2026-10-05');
  });

  describe('owner at event time', () => {
    const caseResource = {
      type: NotificationResourceType.MEDICAL_CASE,
      id: 'c1',
      horseId: 'h1',
    };
    const lockResource = {
      type: NotificationResourceType.TRAINING_LOCK,
      id: 'l1',
      horseId: 'h1',
    };
    const horseRef = {
      type: NotificationResourceType.HORSE,
      id: 'h1',
      horseId: 'h1',
    };
    const handlers: Array<{
      name: string;
      resource: unknown;
      run: (
        s: MedicalNotificationsService,
        ownerId: string | null | undefined,
      ) => Promise<string[]>;
    }> = [
      {
        name: 'notifyLockSet',
        resource: lockResource,
        run: (s, ownerId) =>
          s.notifyLockSet({
            eventId: 'e',
            horseId: 'h1',
            lockId: 'l1',
            reason: 'Nghỉ',
            expectedEnd: null,
            ownerId,
          } as TrainingLockSetEvent),
      },
      {
        name: 'notifyLockReleased',
        resource: lockResource,
        run: (s, ownerId) =>
          s.notifyLockReleased({
            eventId: 'e',
            horseId: 'h1',
            lockId: 'l1',
            conclusion: 'Ổn',
            ownerId,
          } as TrainingLockReleasedEvent),
      },
      ...[
        HorseHealthStatus.INJURED,
        HorseHealthStatus.UNDER_OBSERVATION,
        HorseHealthStatus.ELIGIBLE,
      ].map((to) => ({
        name: `notifyHealthChanged → ${to}`,
        resource: horseRef,
        run: (
          s: MedicalNotificationsService,
          ownerId: string | null | undefined,
        ) =>
          s.notifyHealthChanged({
            eventId: 'e',
            horseId: 'h1',
            from:
              to === HorseHealthStatus.ELIGIBLE
                ? HorseHealthStatus.INJURED
                : HorseHealthStatus.ELIGIBLE,
            to,
            ownerId,
          } as HealthChangedEvent),
      })),
      {
        name: 'notifyHealthChanged → QUARANTINED with exposed horses',
        resource: horseRef,
        run: (s, ownerId) =>
          s.notifyHealthChanged({
            eventId: 'e',
            horseId: 'h1',
            from: HorseHealthStatus.ELIGIBLE,
            to: HorseHealthStatus.QUARANTINED,
            exposedHorses: [
              {
                horseId: 'x',
                horseName: 'X',
                sameBarn: true,
                sameGroom: false,
              },
            ],
            ownerId,
          } as HealthChangedEvent),
      },
      {
        name: 'notifyCaseOpened',
        resource: caseResource,
        run: (s, ownerId) =>
          s.notifyCaseOpened({
            eventId: 'e',
            horseId: 'h1',
            caseId: 'c1',
            initialDiagnosis: 'Viêm gân',
            ownerId,
          } as MedicalCaseOpenedEvent),
      },
      {
        name: 'notifyCaseCancelled',
        resource: caseResource,
        run: (s, ownerId) =>
          s.notifyCaseCancelled({
            eventId: 'e',
            horseId: 'h1',
            caseId: 'c1',
            reason: 'Mở nhầm',
            ownerId,
          } as MedicalCaseCancelledEvent),
      },
      {
        name: 'notifyCaseClosed',
        resource: caseResource,
        run: (s, ownerId) =>
          s.notifyCaseClosed({
            eventId: 'e',
            horseId: 'h1',
            caseId: 'c1',
            totalCost: 5000000,
            ownerId,
            ownerCost: ownerId === null ? null : 2000000,
          } as MedicalCaseClosedEvent),
      },
    ];
    const ownerDrafts = () =>
      (notifications.send.mock.calls as Array<[NotificationDraft]>)
        .map(([draft]) => draft)
        .filter((draft) =>
          draft.recipientIds.some((id) => id.startsWith('owner-')),
        );

    describe.each(handlers)('$name', ({ resource, run }) => {
      it('sends to the owner with the link when the owner is unchanged', async () => {
        await run(service, 'owner-1');
        expect(ownerDrafts().map((d) => [d.recipientIds, d.resource])).toEqual([
          [expect.arrayContaining(['owner-1']), resource],
        ]);
      });

      it('sends to the owner at event time without a link, not to the new owner', async () => {
        recipients.findHorseMedicalContact.mockResolvedValue({
          horseName: 'Winx',
          headTrainerId: 'ht-1',
          ownerId: 'owner-2',
          groomId: 'groom-1',
        });
        await run(service, 'owner-1');
        expect(ownerDrafts().map((d) => [d.recipientIds, d.resource])).toEqual([
          [['owner-1'], null],
        ]);
        expect(recipients.isActiveUserWithRole).toHaveBeenCalledWith(
          'owner-1',
          UserRole.HORSE_OWNER,
        );
      });

      it('skips the owner at event time who is no longer an active horse owner', async () => {
        recipients.findHorseMedicalContact.mockResolvedValue({
          horseName: 'Winx',
          headTrainerId: 'ht-1',
          ownerId: 'owner-2',
          groomId: 'groom-1',
        });
        recipients.isActiveUserWithRole.mockResolvedValue(false);
        await run(service, 'owner-1');
        expect(ownerDrafts()).toEqual([]);
      });

      it('tells no owner when the horse had no owner at event time', async () => {
        await run(service, null);
        expect(ownerDrafts()).toEqual([]);
      });

      it('falls back to the current owner for an old payload without ownerId', async () => {
        recipients.findHorseMedicalContact.mockResolvedValue({
          horseName: 'Winx',
          headTrainerId: 'ht-1',
          ownerId: 'owner-2',
          groomId: 'groom-1',
        });
        await run(service, undefined);
        expect(ownerDrafts().map((d) => [d.recipientIds, d.resource])).toEqual([
          [expect.arrayContaining(['owner-2']), resource],
        ]);
        expect(recipients.isActiveUserWithRole).not.toHaveBeenCalled();
      });
    });
  });
});
