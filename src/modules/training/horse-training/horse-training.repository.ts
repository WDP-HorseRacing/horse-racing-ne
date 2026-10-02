import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { HorseTrainingSessionWhen } from '../enums/horse-training-session-when.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import type {
  HorseTrainingClassRow,
  HorseTrainingSessionFilter,
  HorseTrainingSessionRow,
} from '../types/horse-training.types';

const HIDDEN_UPCOMING_STATUSES = [
  SessionParticipantStatus.CANCELLED,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
];

/**
 * Các câu đọc lớp và lịch buổi tập theo con ngựa. Chỉ đọc.
 */
@Injectable()
export class HorseTrainingRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Liệt kê mọi lần ngựa vào lớp, lớp đang học đứng trước rồi tới lớp đã rời, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về các lần vào lớp kèm tên lớp và Head Trainer phụ trách
   */
  listClasses(horseId: string): Promise<HorseTrainingClassRow[]> {
    return this.dataSource
      .getRepository(HorseEnrollmentEntity)
      .createQueryBuilder('enrollment')
      .withDeleted()
      .innerJoin('enrollment.trainingClass', 'class')
      .leftJoin('class.headTrainer', 'headTrainer')
      .select('enrollment.id', 'enrollmentId')
      .addSelect('class.id', 'classId')
      .addSelect('class.code', 'code')
      .addSelect('class.name', 'name')
      .addSelect('class.status', 'classStatus')
      .addSelect('headTrainer.fullName', 'headTrainerName')
      .addSelect('enrollment.status', 'enrollmentStatus')
      .addSelect('enrollment.enrolledAt', 'enrolledAt')
      .addSelect('enrollment.leftAt', 'leftAt')
      .where('enrollment.horseId = :horseId', { horseId })
      .orderBy('enrollment.status = :activeStatus', 'DESC')
      .addOrderBy('enrollment.enrolledAt', 'DESC')
      .setParameter('activeStatus', HorseEnrollmentStatus.ACTIVE)
      .getRawMany<HorseTrainingClassRow>();
  }

  /**
   * Đọc một trang lượt tập của ngựa kèm tổng số lượt khớp bộ lọc
   *
   * - upcoming: buổi bắt đầu từ `now` trở đi, gần nhất trước, bỏ lượt CANCELLED và CANCELLED_BY_LOCK
   * - history: buổi bắt đầu trước `now`, mới nhất trước
   * - Bỏ trống `when`: mọi buổi, mới nhất trước
   *
   * @param horseId UUID của ngựa
   * @param filter Lớp, khoảng thời gian và trang cần lấy
   * @returns Promise trả về các lượt tập trong trang và tổng số lượt
   */
  async listSessions(
    horseId: string,
    filter: HorseTrainingSessionFilter,
  ): Promise<{ rows: HorseTrainingSessionRow[]; total: number }> {
    const query = this.sessionsOfHorse(horseId, filter);
    const total = await query.clone().getCount();
    const rows = await query
      .leftJoin('participant.assignedGroom', 'groom')
      .select('participant.id', 'participantId')
      .addSelect('session.id', 'sessionId')
      .addSelect('class.id', 'classId')
      .addSelect('class.name', 'className')
      .addSelect('plan.name', 'planName')
      .addSelect('plan.phaseName', 'phaseName')
      .addSelect('session.name', 'name')
      .addSelect('session.sessionType', 'sessionType')
      .addSelect('session.scheduledStartAt', 'scheduledStartAt')
      .addSelect('session.scheduledEndAt', 'scheduledEndAt')
      .addSelect('session.location', 'location')
      .addSelect('session.surface', 'surface')
      .addSelect('session.status', 'sessionStatus')
      .addSelect('participant.status', 'participantStatus')
      .addSelect('groom.fullName', 'groomName')
      .addSelect('participant.absenceReason', 'absenceReason')
      .addSelect('participant.cancelReason', 'cancelReason')
      .addSelect('participant.completedAt', 'completedAt')
      .orderBy(
        'session.scheduledStartAt',
        filter.when === HorseTrainingSessionWhen.UPCOMING ? 'ASC' : 'DESC',
      )
      .addOrderBy('participant.id', 'ASC')
      .offset(filter.skip)
      .limit(filter.limit)
      .getRawMany<HorseTrainingSessionRow>();
    return { rows, total };
  }

  /**
   * Dựng câu đọc lượt tập của một con ngựa theo bộ lọc, chưa chọn cột và chưa sắp xếp
   *
   * - Nối lượt tập với buổi, giáo án và lớp; đọc cả tài khoản đã xóa mềm
   * - upcoming: buổi bắt đầu từ `now` trở đi, bỏ lượt CANCELLED và CANCELLED_BY_LOCK
   * - history: buổi bắt đầu trước `now`
   *
   * @param horseId UUID của ngựa
   * @param filter Lớp và khoảng thời gian cần lọc
   * @returns Query builder của các lượt tập khớp bộ lọc
   */
  private sessionsOfHorse(
    horseId: string,
    filter: HorseTrainingSessionFilter,
  ): SelectQueryBuilder<SessionParticipantEntity> {
    const query = this.dataSource
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .withDeleted()
      .innerJoin('participant.session', 'session')
      .innerJoin('session.plan', 'plan')
      .innerJoin('plan.trainingClass', 'class')
      .where('participant.horseId = :horseId', { horseId });
    if (filter.classId) {
      query.andWhere('class.id = :classId', { classId: filter.classId });
    }
    if (filter.when === HorseTrainingSessionWhen.UPCOMING) {
      query
        .andWhere('session.scheduledStartAt >= :now', { now: filter.now })
        .andWhere('participant.status NOT IN (:...hiddenStatuses)', {
          hiddenStatuses: HIDDEN_UPCOMING_STATUSES,
        });
    } else if (filter.when === HorseTrainingSessionWhen.HISTORY) {
      query.andWhere('session.scheduledStartAt < :now', { now: filter.now });
    }
    return query;
  }
}
