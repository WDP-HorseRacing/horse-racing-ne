import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { followUpStateOf } from '../policies/follow-up.policy';

/**
 * Các câu ghi dùng chung lên bảng care_schedules, luôn chạy trong transaction đang mở
 */
@Injectable()
export class CareScheduleWritesService {
  /**
   * Hoàn tất ngày hẹn khám định kỳ đang Đã lên lịch của con ngựa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param completedBy UUID người khám
   * @param recordId UUID buổi khám hoàn tất ngày hẹn
   * @returns Promise trả về số ngày hẹn đã hoàn tất
   */
  async completeRoutineCheckup(
    manager: EntityManager,
    horseId: string,
    completedBy: string,
    recordId: string,
  ): Promise<number> {
    const result = await manager.update(
      CareScheduleEntity,
      {
        horseId,
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.COMPLETED,
        completedAt: new Date(),
        completedBy,
        completedRecordId: recordId,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Mở lại ngày hẹn khám định kỳ mà một buổi khám đã hoàn tất, khi buổi khám đó bị hủy
   *
   * - Ngày hẹn về Đã lên lịch, bỏ thời điểm, người và buổi khám hoàn tất; ngày hẹn đã quá hạn vẫn mở lại
   * - Ngựa đã có ngày hẹn khám định kỳ khác đang Đã lên lịch: giữ nguyên Hoàn tất
   * - Buổi khám không hoàn tất ngày hẹn nào: không đổi gì
   *
   * @param manager EntityManager của transaction đang chạy, đã khóa ngựa
   * @param horseId UUID của ngựa
   * @param recordId UUID buổi khám bị hủy
   * @returns Promise trả về true nếu đã mở lại một ngày hẹn
   */
  async reopenRoutineCheckup(
    manager: EntityManager,
    horseId: string,
    recordId: string,
  ): Promise<boolean> {
    const hasOpen = await manager.exists(CareScheduleEntity, {
      where: {
        horseId,
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
      },
    });
    if (hasOpen) return false;
    const result = await manager.update(
      CareScheduleEntity,
      {
        horseId,
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.COMPLETED,
        completedRecordId: recordId,
      },
      {
        status: CareScheduleStatus.SCHEDULED,
        completedAt: null,
        completedBy: null,
        completedRecordId: null,
      },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Hủy mọi lịch chăm sóc còn Đã lên lịch của con ngựa khi hồ sơ ngựa chuyển sang chỉ được xem (chuyển nhượng hoặc đã mất)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param cancelReason Lý do hủy ghi vào lịch
   * @returns Promise trả về số lịch đã hủy
   */
  async cancelOpenSchedulesBeforeReadOnly(
    manager: EntityManager,
    horseId: string,
    cancelReason: string,
  ): Promise<number> {
    const result = await manager.getRepository(CareScheduleEntity).update(
      {
        horseId,
        status: CareScheduleStatus.SCHEDULED,
      },
      {
        status: CareScheduleStatus.CANCELLED,
        cancelReason,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Đặt, dời hoặc bỏ ngày hẹn tái khám của một buổi khám
   *
   * - dueAt null: xóa lịch tái khám của buổi khám (buổi khám không còn hẹn)
   * - Chưa có lịch: tạo lịch FOLLOW_UP Đã lên lịch, không giao ai; đã có: đổi ngày và bệnh án
   * - Trạng thái cuối của lịch do syncCaseFollowUps quyết, phải gọi ngay sau hàm này
   *
   * @param manager EntityManager của transaction đang chạy
   * @param visit Buổi khám đặt hẹn (id, ngựa)
   * @param caseId UUID bệnh án chứa buổi khám
   * @param dueAt Ngày giờ hẹn tái khám, null nếu buổi khám không hẹn
   * @returns Promise hoàn tất khi đã ghi
   */
  async setVisitFollowUp(
    manager: EntityManager,
    visit: Pick<MedicalRecordEntity, 'id' | 'horseId'>,
    caseId: string,
    dueAt: Date | null,
  ): Promise<void> {
    if (dueAt === null) {
      await manager.delete(CareScheduleEntity, {
        recordId: visit.id,
        type: CareScheduleType.FOLLOW_UP,
      });
      return;
    }
    const existing = await manager.findOne(CareScheduleEntity, {
      where: { recordId: visit.id, type: CareScheduleType.FOLLOW_UP },
    });
    if (existing) {
      await manager.update(
        CareScheduleEntity,
        { id: existing.id },
        { dueAt, caseId },
      );
      return;
    }
    await manager.save(
      manager.create(CareScheduleEntity, {
        horseId: visit.horseId,
        type: CareScheduleType.FOLLOW_UP,
        dueAt,
        assigneeType: null,
        assignedTo: null,
        status: CareScheduleStatus.SCHEDULED,
        completedAt: null,
        completedBy: null,
        cancelReason: null,
        notes: null,
        caseId,
        recordId: visit.id,
      }),
    );
  }

  /**
   * Đồng bộ trạng thái mọi lịch tái khám của một bệnh án theo các buổi khám và trạng thái bệnh án
   *
   * - Lịch của buổi khám đã hủy: Đã hủy
   * - Lịch của buổi khám chưa hủy mới nhất: Đã lên lịch khi bệnh án đang điều trị; bệnh án đã đóng hoặc đã hủy thì Đã hủy
   * - Lịch của buổi khám cũ hơn: Hoàn tất, thời điểm và người hoàn tất là buổi khám chưa hủy ngay sau đó
   * - Chỉ ghi các lịch có trạng thái đổi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param caseId UUID bệnh án
   * @returns Promise hoàn tất khi đã đồng bộ
   */
  async syncCaseFollowUps(
    manager: EntityManager,
    caseId: string,
  ): Promise<void> {
    const schedules = await manager.find(CareScheduleEntity, {
      where: { caseId, type: CareScheduleType.FOLLOW_UP },
    });
    if (schedules.length === 0) return;
    const medicalCase = await manager.findOneByOrFail(MedicalCaseEntity, {
      id: caseId,
    });
    const visits = await manager.find(MedicalRecordEntity, {
      where: { caseId },
      select: { id: true, examDate: true, vetId: true, voidedAt: true },
      order: { examDate: 'ASC', createdAt: 'ASC' },
    });
    const active = visits.filter((visit) => visit.voidedAt === null);
    for (const schedule of schedules) {
      const target = followUpStateOf(medicalCase.status, active, schedule);
      if (
        schedule.status !== target.status ||
        schedule.cancelReason !== target.cancelReason ||
        schedule.completedBy !== target.completedBy ||
        schedule.completedAt?.getTime() !== target.completedAt?.getTime()
      ) {
        await manager.update(CareScheduleEntity, { id: schedule.id }, target);
      }
    }
  }
}
