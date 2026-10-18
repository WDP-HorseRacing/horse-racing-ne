import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { MediaService } from '../../media/services/media.service';
import { UserEntity } from '../../users/entities/user.entity';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import {
  AssignParticipantGroomDto,
  MarkParticipantAbsentDto,
  SessionParticipantListItemDto,
  SessionParticipantResponseDto,
  StopParticipantDto,
} from '../dto/session-participant.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import {
  toSessionParticipantListItem,
  toSessionParticipantResponse,
} from '../mappers/session-participant.mapper';
import {
  assertGroomFreeForRun,
  assertParticipantAbsent,
  assertParticipantCheckIn,
  assertParticipantComplete,
  assertParticipantReady,
  assertParticipantActionWindow,
  assertParticipantStart,
  assertParticipantStop,
  assertSessionOperational,
  eligibilityForSession,
} from '../policies/training.policy';
import {
  CHECK_IN_OPENS_BEFORE_MS,
  START_OPENS_BEFORE_MS,
} from '../constants/participant-window.constants';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingOperationsFacade } from '../shared/training-operations.facade';
import { TRAINING_RUN_GROOM_ASSIGNED_EVENT } from '../constants/training-events.constants';
import type { TrainingRunGroomAssignedEvent } from '../types/training-session.types';
import { horseListDisplay } from '../utils/horse-list-display';

@Injectable()
export class SessionParticipantsService {
  constructor(
    @InjectRepository(SessionParticipantEntity)
    private readonly participants: Repository<SessionParticipantEntity>,
    private readonly access: TrainingAccessService,
    private readonly operations: TrainingOperationsFacade,
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Liệt kê các lượt tham gia của buổi tập mà người gọi được xem, mỗi lượt kèm cờ ngựa đang bị khóa huấn luyện, tên và ảnh ngựa, tên Groom
   *
   * - Tên ngựa và Groom vẫn hiện khi bản ghi đã xóa mềm
   * - Ảnh ngựa chỉ ký link sau khi đã lọc các lượt người gọi được xem
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
      relations: { session: { trainingClass: true } },
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
    const briefs = await this.access.horseBriefs(
      shown.map((row) => row.horseId),
    );
    const [photoUrls, groomNames] = await Promise.all([
      this.media.signDownloadUrls(
        [...briefs.values()]
          .map((brief) => brief.mediaId)
          .filter((id): id is string => id !== null),
      ),
      this.userNames(
        shown
          .map((row) => row.assignedGroomId)
          .filter((id): id is string => id !== null),
      ),
    ]);
    return shown.map((row) =>
      toSessionParticipantListItem(row, lockedHorseIds, {
        ...horseListDisplay(row.horseId, briefs, photoUrls),
        assignedGroomName: row.assignedGroomId
          ? (groomNames.get(row.assignedGroomId) ?? null)
          : null,
      }),
    );
  }

  /**
   * Lấy họ tên của nhiều người dùng trong một câu truy vấn, kể cả tài khoản đã xóa mềm
   *
   * @param userIds UUID các người dùng cần lấy, có thể trùng nhau
   * @returns Promise trả về map từ UUID người dùng sang họ tên, rỗng nếu không truyền id nào
   */
  private async userNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await this.dataSource.manager.find(UserEntity, {
      select: { id: true, fullName: true },
      where: { id: In([...new Set(userIds)]) },
      withDeleted: true,
    });
    return new Map(users.map((user) => [user.id, user.fullName]));
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

  /**
   * Giao hoặc gỡ Groom dắt một lượt tập
   *
   * - Lock buổi tập, user của Groom được giao (nếu có), rồi lượt tập trước khi kiểm
   * - Groom mới đang dắt lượt còn mở ở buổi khác chưa hủy trùng giờ: 409 (assertGroomFreeForRun)
   * - Người dắt đổi: ghi nhật ký người dắt trước và sau
   * - Người dắt đổi sang Groom khác: ghi TRAINING_RUN_GROOM_ASSIGNED_EVENT vào outbox để báo Groom mới; gỡ người dắt thì không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @param body Groom được giao, null để gỡ
   * @returns Promise trả về lượt tham gia sau khi giao
   * @throws NotFoundException Nếu không có lượt tham gia hoặc buổi tập
   * @throws ForbiddenException Nếu người gọi không quản lý lớp hoặc ngựa ngoài khu của Head Trainer
   * @throws ConflictException Nếu buổi không ở trạng thái thực thi, lượt đã kết thúc, hoặc Groom đang dắt lượt khác trùng giờ
   * @throws BadRequestException Nếu groomId không phải Groom đang hoạt động
   */
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
      if (body.groomId) await this.access.lockUsers(manager, [body.groomId]);
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        context.session.trainingClass.headTrainerId,
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
          SessionParticipantStatus.STOPPED,
          SessionParticipantStatus.ABSENT,
          SessionParticipantStatus.INELIGIBLE,
          SessionParticipantStatus.CANCELLED,
          SessionParticipantStatus.CANCELLED_BY_LOCK,
        ].includes(participant.status)
      ) {
        throw new ConflictException(
          'Không thể giao Groom cho lượt tập đã kết thúc',
        );
      }
      if (body.groomId) await this.access.assertGroom(manager, body.groomId);
      if (body.groomId && body.groomId !== participant.assignedGroomId) {
        assertGroomFreeForRun(
          {
            sessionId: session.id,
            status: participant.status,
            sessionStatus: session.status,
            sessionName: session.name,
            horseName: context.horse.name,
            scheduledStartAt: session.scheduledStartAt,
            scheduledEndAt: session.scheduledEndAt,
          },
          await this.access.groomRunsBetween(
            manager,
            body.groomId,
            session.scheduledStartAt,
            session.scheduledEndAt,
          ),
        );
      }
      const previousGroomId = participant.assignedGroomId;
      participant.assignedGroomId = body.groomId ?? null;
      const saved = await manager.save(participant);
      if (previousGroomId !== saved.assignedGroomId) {
        await this.recordRun(
          manager,
          caller.id,
          participantId,
          { assignedGroomId: previousGroomId },
          { assignedGroomId: saved.assignedGroomId },
        );
      }
      if (saved.assignedGroomId && previousGroomId !== saved.assignedGroomId) {
        const assigned: TrainingRunGroomAssignedEvent = {
          eventId: randomUUID(),
          participantId,
          groomId: saved.assignedGroomId,
          horseId: saved.horseId,
          horseName: context.horse.name,
          sessionId: session.id,
          sessionName: session.name,
          scheduledStartAt: session.scheduledStartAt.toISOString(),
          location: session.location,
          surface: session.surface,
        };
        await this.events.publish(
          manager,
          TRAINING_RUN_GROOM_ASSIGNED_EVENT,
          assigned,
        );
      }
      return saved;
    });
    return toSessionParticipantResponse(saved);
  }

  /**
   * Điểm danh ngựa có mặt ở đầu buổi tập
   *
   * - Ngựa đang bị khóa huấn luyện: lưu lượt thành CANCELLED_BY_LOCK rồi trả 409
   * - Ngựa không được tập vì lý do khác: lưu lượt thành INELIGIBLE rồi trả 409
   * - Ngựa được tập: lượt chuyển PRESENT
   * - Chỉ trong khung giờ từ CHECK_IN_OPENS_BEFORE_MS trước giờ bắt đầu tới giờ kết thúc buổi tập
   * - Ghi nhật ký trạng thái lượt trước và sau, kể cả khi lượt bị đánh không được tập
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @returns Promise trả về lượt tham gia sau khi điểm danh
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu buổi không ở trạng thái thực thi, ngoài khung giờ điểm danh, lượt không ở PLANNED hoặc ngựa không còn được tập
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
      assertParticipantActionWindow(
        session,
        CHECK_IN_OPENS_BEFORE_MS,
        new Date(),
      );
      assertParticipantCheckIn(participant.status);
      const previousStatus = participant.status;
      if (await this.markIfIneligible(manager, horse, session, participant)) {
        await this.recordStatusChange(
          manager,
          caller.id,
          participant,
          previousStatus,
        );
        return { rejected: true as const };
      }
      participant.status = SessionParticipantStatus.PRESENT;
      participant.checkedInAt = new Date();
      const saved = await manager.save(participant);
      await this.recordStatusChange(manager, caller.id, saved, previousStatus);
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
    return this.mutateParticipant(
      actor,
      participantId,
      (participant, session) => {
        assertParticipantActionWindow(
          session,
          CHECK_IN_OPENS_BEFORE_MS,
          new Date(),
        );
        assertParticipantAbsent(participant.status);
        participant.status = SessionParticipantStatus.ABSENT;
        participant.absenceReason = body.reason;
      },
    );
  }

  async ready(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(
      actor,
      participantId,
      (participant, session) => {
        assertParticipantActionWindow(
          session,
          START_OPENS_BEFORE_MS,
          new Date(),
        );
        assertParticipantReady(participant.status);
        participant.status = SessionParticipantStatus.READY;
      },
    );
  }

  /**
   * Bắt đầu lượt tập của một con ngựa
   *
   * - Ngựa đang bị khóa huấn luyện: lưu lượt thành CANCELLED_BY_LOCK rồi trả 409
   * - Ngựa không được tập vì lý do khác: lưu lượt thành INELIGIBLE rồi trả 409
   * - Ngựa được tập: lượt chuyển ONGOING, buổi SCHEDULED chuyển IN_PROGRESS
   * - Chỉ trong khung giờ từ START_OPENS_BEFORE_MS trước giờ bắt đầu tới giờ kết thúc buổi tập
   * - Ghi nhật ký trạng thái lượt trước và sau, kể cả khi lượt bị đánh không được tập
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @returns Promise trả về lượt tham gia sau khi bắt đầu
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập, lớp hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu lượt không ở READY, lớp chưa ACTIVE, buổi không ở trạng thái thực thi, ngoài khung giờ bắt đầu, ngựa không còn được tập hoặc ngựa đang có lượt ONGOING khác
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
      const trainingClass = await this.access.findTrainingClass(
        manager,
        session.classId,
      );
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Lớp chưa ở trạng thái đang chạy');
      }
      if (
        session.status !== TrainingSessionStatus.SCHEDULED &&
        session.status !== TrainingSessionStatus.IN_PROGRESS
      ) {
        throw new ConflictException(
          'Buổi tập đã kết thúc hoặc đã hủy, không thao tác được',
        );
      }
      assertParticipantActionWindow(session, START_OPENS_BEFORE_MS, new Date());
      const previousStatus = participant.status;
      if (await this.markIfIneligible(manager, horse, session, participant)) {
        await this.recordStatusChange(
          manager,
          caller.id,
          participant,
          previousStatus,
        );
        return { rejected: true as const };
      }
      if (
        await this.operations.hasOngoingParticipant(
          manager,
          horse.id,
          participant.id,
        )
      ) {
        throw new ConflictException('Ngựa đang có lượt tập khác đang tập');
      }
      participant.status = SessionParticipantStatus.ONGOING;
      participant.startedAt = new Date();
      await manager.save(participant);
      await this.recordStatusChange(
        manager,
        caller.id,
        participant,
        previousStatus,
      );
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
    return this.finishRun(
      actor,
      participantId,
      assertParticipantComplete,
      (participant) => {
        participant.status = SessionParticipantStatus.COMPLETED;
      },
    );
  }

  /**
   * Dừng sớm một lượt đang tập, lưu lý do và giờ kết thúc như hoàn thành lượt
   *
   * - Lượt chuyển STOPPED, giờ kết thúc lưu vào completedAt
   * - Ghi nhật ký trạng thái lượt trước và sau kèm lý do dừng
   * - Lượt cuối còn mở kết thúc thì buổi tự đóng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @param body Lý do dừng sớm
   * @returns Promise trả về lượt tham gia sau khi dừng
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu lượt không ở ONGOING hoặc buổi không ở IN_PROGRESS
   */
  async stop(
    actor: Actor,
    participantId: string,
    body: StopParticipantDto,
  ): Promise<SessionParticipantResponseDto> {
    return this.finishRun(
      actor,
      participantId,
      assertParticipantStop,
      (participant) => {
        participant.status = SessionParticipantStatus.STOPPED;
        participant.stoppedReason = body.reason;
      },
    );
  }

  /**
   * Kết thúc một lượt đang tập trong transaction, rồi cập nhật trạng thái buổi
   *
   * - Khóa ngựa, buổi và lượt; kiểm quyền thao tác, kiểm trạng thái lượt rồi buổi IN_PROGRESS
   * - Giờ kết thúc lưu vào completedAt; ghi nhật ký trạng thái lượt trước và sau
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @param assertFinishable Policy kiểm trạng thái lượt còn kết thúc được
   * @param finish Hàm đổi trạng thái lượt sang trạng thái kết thúc
   * @returns Promise trả về lượt tham gia sau khi kết thúc
   * @throws NotFoundException Nếu không có lượt tham gia, buổi tập hoặc ngựa
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu assertFinishable từ chối hoặc buổi không ở IN_PROGRESS
   */
  private async finishRun(
    actor: Actor,
    participantId: string,
    assertFinishable: (status: SessionParticipantStatus) => void,
    finish: (participant: SessionParticipantEntity) => void,
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
      assertFinishable(participant.status);
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Buổi tập chưa ở trạng thái đang diễn ra');
      }
      const previousStatus = participant.status;
      finish(participant);
      participant.completedAt = new Date();
      await manager.save(participant);
      await this.recordStatusChange(
        manager,
        caller.id,
        participant,
        previousStatus,
      );
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      void horse;
      return participant;
    });
    return toSessionParticipantResponse(saved);
  }

  /**
   * Đổi trạng thái một lượt tập trong transaction sau khi kiểm buổi còn thực thi và quyền thao tác, rồi cập nhật trạng thái buổi
   *
   * - Ghi nhật ký trạng thái lượt trước và sau
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia
   * @param mutate Hàm kiểm và đổi lượt, nhận lượt và buổi tập đã khóa
   * @returns Promise trả về lượt tham gia sau khi đổi
   * @throws NotFoundException Nếu không có lượt tham gia hoặc buổi tập
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt này
   * @throws ConflictException Nếu buổi không ở trạng thái thực thi hoặc mutate từ chối
   */
  private async mutateParticipant(
    actor: Actor,
    participantId: string,
    mutate: (
      participant: SessionParticipantEntity,
      session: TrainingSessionEntity,
    ) => void,
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
      const previousStatus = participant.status;
      mutate(participant, session);
      const saved = await manager.save(participant);
      await this.recordStatusChange(manager, caller.id, saved, previousStatus);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      return saved;
    });
    return toSessionParticipantResponse(saved);
  }

  /**
   * Ghi nhật ký một lần đổi trạng thái lượt tập
   *
   * - Lượt vắng: lý do vắng ghi vào cột lý do
   * - Lượt dừng sớm: lý do dừng ghi vào cột lý do
   * - Lượt bị đánh không được tập: kèm lý do không được tập
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID người thao tác
   * @param participant Lượt tập sau khi đổi trạng thái
   * @param previousStatus Trạng thái trước khi đổi
   * @returns Promise hoàn tất khi đã ghi
   */
  private async recordStatusChange(
    manager: EntityManager,
    callerId: string,
    participant: SessionParticipantEntity,
    previousStatus: SessionParticipantStatus,
  ): Promise<void> {
    const ineligible =
      participant.status === SessionParticipantStatus.INELIGIBLE ||
      participant.status === SessionParticipantStatus.CANCELLED_BY_LOCK;
    await this.recordRun(
      manager,
      callerId,
      participant.id,
      { status: previousStatus },
      {
        status: participant.status,
        ...(ineligible && {
          ineligibilityReason: participant.ineligibilityReason,
        }),
      },
      this.runReason(participant),
    );
  }

  /**
   * Lấy lý do ghi vào nhật ký theo trạng thái mới của lượt tập
   *
   * @param participant Lượt tập sau khi đổi trạng thái
   * @returns Lý do vắng với lượt ABSENT, lý do dừng với lượt STOPPED, còn lại null
   */
  private runReason(participant: SessionParticipantEntity): string | null {
    if (participant.status === SessionParticipantStatus.ABSENT) {
      return participant.absenceReason;
    }
    if (participant.status === SessionParticipantStatus.STOPPED) {
      return participant.stoppedReason;
    }
    return null;
  }

  /**
   * Ghi một dòng nhật ký cho lượt tập
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID người thao tác
   * @param participantId UUID của lượt tập
   * @param before Giá trị trước khi đổi
   * @param after Giá trị sau khi đổi
   * @param reason Lý do kèm theo, bỏ trống thì lưu null
   * @returns Promise hoàn tất khi đã ghi
   */
  private async recordRun(
    manager: EntityManager,
    callerId: string,
    participantId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    reason: string | null = null,
  ): Promise<void> {
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.SESSION_PARTICIPANT,
      entityId: participantId,
      before,
      after,
      reason,
      feature: AuditFeature.TRAIN_RUN,
    });
  }

  /**
   * Đánh lượt tham gia là không được tập nếu ngựa không còn đủ điều kiện, chạy trong transaction của nơi gọi
   *
   * - Ngựa đang bị khóa huấn luyện: lượt chuyển CANCELLED_BY_LOCK
   * - Ngựa không được tập vì lý do khác, kể cả ngựa Cần theo dõi gặp buổi không phải LIGHT: lượt chuyển INELIGIBLE
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
