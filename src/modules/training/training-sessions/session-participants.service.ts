import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import {
  AssignParticipantGroomDto,
  MarkParticipantAbsentDto,
  SessionParticipantListItemDto,
  SessionParticipantResponseDto,
} from '../dto/session-participant.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import {
  toSessionParticipantListItem,
  toSessionParticipantResponse,
} from '../mappers/session-participant.mapper';
import {
  assertParticipantAbsent,
  assertParticipantCheckIn,
  assertParticipantComplete,
  assertParticipantReady,
  assertParticipantStart,
  assertSessionOperational,
  eligibilityForSession,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingOperationsFacade } from '../shared/training-operations.facade';

@Injectable()
export class SessionParticipantsService {
  constructor(
    @InjectRepository(SessionParticipantEntity)
    private readonly participants: Repository<SessionParticipantEntity>,
    private readonly access: TrainingAccessService,
    private readonly operations: TrainingOperationsFacade,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê các lượt tham gia của buổi tập mà người gọi được xem, mỗi lượt kèm cờ ngựa đang bị khóa huấn luyện
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @returns Promise trả về các lượt tham gia theo thứ tự tạo
   */
  async list(
    actor: Actor,
    sessionId: string,
  ): Promise<SessionParticipantListItemDto[]> {
    await this.access.assertCanReadSession(actor, sessionId);
    const caller = await this.access.currentUser(actor);
    const rows = await this.participants.find({
      where: { sessionId },
      relations: { session: { plan: { trainingClass: true } } },
      order: { createdAt: 'ASC' },
    });
    const visible = await Promise.all(
      rows.map(async (row) =>
        (await this.access.canReadParticipant(
          actor,
          caller.id,
          row,
          this.dataSource.manager,
        ))
          ? row
          : null,
      ),
    );
    const shown = visible.filter(
      (row): row is SessionParticipantEntity => !!row,
    );
    const lockedHorseIds = await this.lockedHorseIds(
      shown.map((row) => row.horseId),
    );
    return shown.map((row) =>
      toSessionParticipantListItem(row, lockedHorseIds),
    );
  }

  /**
   * Lọc ra các ngựa đang có lệnh khóa huấn luyện hiệu lực, một câu truy vấn cho cả danh sách
   *
   * @param horseIds UUID các ngựa cần kiểm
   * @returns Promise trả về tập UUID các ngựa đang bị khóa
   */
  private async lockedHorseIds(horseIds: string[]): Promise<Set<string>> {
    if (horseIds.length === 0) return new Set();
    const locks = await this.dataSource.manager.find(TrainingLockEntity, {
      select: { horseId: true },
      where: { horseId: In(horseIds), status: TrainingLockStatus.ACTIVE },
    });
    return new Set(locks.map((lock) => lock.horseId));
  }

  async assignGroom(
    actor: Actor,
    participantId: string,
    body: AssignParticipantGroomDto,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        context.session.plan.trainingClass.headTrainerId,
      );
      await this.access.assertTrainerBarn(
        manager,
        actor,
        caller.id,
        participant.horseId,
      );
      if (
        [
          SessionParticipantStatus.COMPLETED,
          SessionParticipantStatus.ABSENT,
          SessionParticipantStatus.INELIGIBLE,
          SessionParticipantStatus.CANCELLED,
          SessionParticipantStatus.CANCELLED_BY_LOCK,
        ].includes(participant.status)
      ) {
        throw new ConflictException(
          'Không thể giao Groom cho participant đã kết thúc',
        );
      }
      if (body.groomId) await this.access.assertGroom(manager, body.groomId);
      participant.assignedGroomId = body.groomId ?? null;
      return manager.save(participant);
    });
    return toSessionParticipantResponse(saved);
  }

  /**
   * Điểm danh ngựa có mặt ở đầu buổi tập
   *
   * - Ngựa đang bị khóa huấn luyện: lưu lượt thành CANCELLED_BY_LOCK rồi trả 409
   * - Ngựa không được tập vì lý do khác: lưu lượt thành INELIGIBLE rồi trả 409
   * - Ngựa được tập: lượt chuyển PRESENT
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @returns Promise trả về lượt tham gia sau khi điểm danh
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu buổi không ở trạng thái thực thi, lượt không ở PLANNED hoặc ngựa không còn được tập
   */
  async checkIn(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const horse = await this.access.lockedHorse(manager, snapshot.horseId);
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      assertParticipantCheckIn(participant.status);
      if (await this.markIfIneligible(manager, horse, session, participant)) {
        return { rejected: true as const };
      }
      participant.status = SessionParticipantStatus.PRESENT;
      participant.checkedInAt = new Date();
      const saved = await manager.save(participant);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      return { rejected: false as const, participant: saved };
    });
    if (outcome.rejected) {
      throw new ConflictException('Ngựa không còn đủ điều kiện để điểm danh');
    }
    return toSessionParticipantResponse(outcome.participant);
  }

  async absent(
    actor: Actor,
    participantId: string,
    body: MarkParticipantAbsentDto,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(actor, participantId, (participant) => {
      assertParticipantAbsent(participant.status);
      participant.status = SessionParticipantStatus.ABSENT;
      participant.absenceReason = body.reason;
    });
  }

  async ready(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(actor, participantId, (participant) => {
      assertParticipantReady(participant.status);
      participant.status = SessionParticipantStatus.READY;
    });
  }

  /**
   * Bắt đầu lượt tập của một con ngựa
   *
   * - Ngựa đang bị khóa huấn luyện: lưu lượt thành CANCELLED_BY_LOCK rồi trả 409
   * - Ngựa không được tập vì lý do khác: lưu lượt thành INELIGIBLE rồi trả 409
   * - Ngựa được tập: lượt chuyển ONGOING, buổi SCHEDULED chuyển IN_PROGRESS
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @returns Promise trả về lượt tham gia sau khi bắt đầu
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập, giáo án hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu lượt không ở READY, giáo án chưa ACTIVE, buổi không ở trạng thái thực thi, ngựa không còn được tập hoặc ngựa đang có lượt ONGOING khác
   */
  async start(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      // Lock ordering is intentional: Horse -> Session -> Participant. The
      // Medical flow uses the same Horse lock before changing TrainingLock.
      const horse = await this.access.lockedHorse(manager, snapshot.horseId);
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      assertParticipantStart(participant.status);
      const plan = await this.access.findPlan(manager, session.planId);
      if (plan.status !== TrainingPlanStatus.ACTIVE) {
        throw new ConflictException('Plan chưa ACTIVE');
      }
      if (
        session.status !== TrainingSessionStatus.SCHEDULED &&
        session.status !== TrainingSessionStatus.IN_PROGRESS
      ) {
        throw new ConflictException('Session không ở trạng thái thực thi');
      }
      if (await this.markIfIneligible(manager, horse, session, participant)) {
        return { rejected: true as const };
      }
      if (
        await this.operations.hasOngoingParticipant(
          manager,
          horse.id,
          participant.id,
        )
      ) {
        throw new ConflictException('Ngựa đang có participant ONGOING khác');
      }
      participant.status = SessionParticipantStatus.ONGOING;
      participant.startedAt = new Date();
      await manager.save(participant);
      if (session.status === TrainingSessionStatus.SCHEDULED) {
        session.status = TrainingSessionStatus.IN_PROGRESS;
        await manager.save(session);
      }
      return { rejected: false as const, participant };
    });
    if (outcome.rejected) {
      throw new ConflictException('Ngựa không còn đủ điều kiện để bắt đầu');
    }
    return toSessionParticipantResponse(outcome.participant);
  }

  async complete(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const horse = await this.access.lockedHorse(manager, snapshot.horseId);
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      assertParticipantComplete(participant.status);
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Session chưa IN_PROGRESS');
      }
      participant.status = SessionParticipantStatus.COMPLETED;
      participant.completedAt = new Date();
      await manager.save(participant);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      void horse;
      return participant;
    });
    return toSessionParticipantResponse(saved);
  }

  private async mutateParticipant(
    actor: Actor,
    participantId: string,
    mutate: (participant: SessionParticipantEntity) => void,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      mutate(participant);
      const saved = await manager.save(participant);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      return saved;
    });
    return toSessionParticipantResponse(saved);
  }

  /**
   * Đánh lượt tham gia là không được tập nếu ngựa không còn đủ điều kiện, chạy trong transaction của nơi gọi
   *
   * - Ngựa đang bị khóa huấn luyện: lượt chuyển CANCELLED_BY_LOCK
   * - Ngựa không được tập vì lý do khác, kể cả ngựa Cần theo dõi gặp buổi HEAVY: lượt chuyển INELIGIBLE
   * - Lượt bị đánh thì ghi lý do và cập nhật trạng thái buổi tập
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horse Con ngựa của lượt, đã khóa row
   * @param session Buổi tập của lượt, đã khóa row
   * @param participant Lượt tham gia, đã khóa row
   * @returns Promise trả về true nếu lượt đã bị đánh không được tập, false nếu ngựa vẫn được tập
   */
  private async markIfIneligible(
    manager: EntityManager,
    horse: HorseEntity,
    session: TrainingSessionEntity,
    participant: SessionParticipantEntity,
  ): Promise<boolean> {
    const activeLock = await manager.findOneBy(TrainingLockEntity, {
      horseId: horse.id,
      status: TrainingLockStatus.ACTIVE,
    });
    const eligibility = eligibilityForSession(
      evaluateEligibility({
        isDeleted: Boolean(horse.deletedAt),
        lifecycleStatus: horse.lifecycleStatus,
        healthStatus: horse.healthStatus,
        hasActiveTrainingLock: !!activeLock,
      }),
      session.intensity,
    );
    if (eligibility.trainingEligible) return false;
    participant.status = activeLock
      ? SessionParticipantStatus.CANCELLED_BY_LOCK
      : SessionParticipantStatus.INELIGIBLE;
    participant.ineligibilityReason = eligibility.trainingReasons
      .join(',')
      .slice(0, 64);
    await manager.save(participant);
    await this.operations.refreshSessionStatus(manager, participant.sessionId);
    return true;
  }
}
