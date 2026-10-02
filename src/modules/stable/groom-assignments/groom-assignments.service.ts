import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, QueryFailedError } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import { clubToday } from '../../horses/utils/club-date';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  AssignGroomDto,
  GroomAssignmentResponseDto,
  GroomWorkloadResponseDto,
} from '../dto/groom-assignment.dto';
import { DailyChecklistsService } from '../shared/daily-checklists.service';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import {
  toGroomAssignmentResponse,
  toGroomWorkloadResponse,
} from '../mappers/groom-assignment.mapper';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../constants/stable-events.constants';
import { assertAssignableGroom } from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';
import type { GroomAssignmentChangedEvent } from '../types/stable-events.types';

/**
 * Thông báo 409 cho từng unique index mà việc đổi groom có thể vi phạm khi hai thao tác chạy cùng lúc.
 */
const GROOM_CONFLICT_MESSAGES: Record<string, string> = {
  groom_assignments_active_horse_uq:
    'Ngựa vừa được giao groom khác, vui lòng tải lại',
  daily_checklists_horse_groom_date_uq:
    'Groom mới vừa có checklist trùng ngày cho ngựa này, không chuyển được checklist của groom cũ',
};

@Injectable()
export class GroomAssignmentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
    private readonly access: StableAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly dailyChecklists: DailyChecklistsService,
    private readonly training: TrainingOperationsFacade,
  ) {}

  /**
   * Liệt kê lịch sử groom phụ trách của một con ngựa, mới nhất trước
   *
   * - Phạm vi xem theo HorseAccessService.findReadableHorseForActor: Club Manager xem được cả hồ sơ đã xóa, Horse Owner chỉ ngựa của mình, vai trò khác mọi ngựa chưa xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các phân công groom của ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem của người gọi
   */
  async listByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<GroomAssignmentResponseDto[]> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const assignments = await this.dataSource.manager.find(
      GroomAssignmentEntity,
      {
        where: { horseId },
        relations: { groom: true },
        order: { startAt: 'DESC' },
      },
    );
    return assignments.map(toGroomAssignmentResponse);
  }

  /**
   * Giao hoặc đổi groom phụ trách một con ngựa.
   *
   * - Chỉ Head Trainer phụ trách khu của ngựa (horses.barn_id) được thao tác, kể cả khi người gọi có thêm vai trò khác.
   * - Ngựa phải đã được xếp khu, chưa chuyển nhượng và chưa bị xóa; khu của ngựa phải đang ACTIVE (lock khu như khi xếp ô).
   * - Lock row user của groom trong transaction rồi mới kiểm groom còn là GROOM đang ACTIVE.
   * - Đổi groom: đóng phân công cũ, mở phân công mới, chuyển checklist chưa hoàn thành từ hôm nay trở đi của groom cũ sang groom mới.
   * - Giao lại đúng groom đang phụ trách thì không thay đổi gì.
   * - Giao hoặc đổi groom: chuyển các lượt tập tương lai của groom cũ và các lượt chưa ai dắt sang groom mới (TrainingOperationsFacade.moveFutureParticipantsToGroom); nhật ký ghi thêm movedParticipantIds.
   * - Sau khi commit: phát GROOM_ASSIGNMENT_CHANGED_EVENT để module notifications báo Groom mới được phân công và Groom cũ (nếu có) không còn phụ trách.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Groom được giao
   * @returns Promise chứa phân công groom đang mở của ngựa sau thao tác
   * @throws BadRequestException Nếu groom không có hoặc không phải Groom
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, khu của ngựa không hoạt động, groom không còn hoạt động, groom mới đã có checklist trùng ngày, hoặc có thao tác khác chạy cùng lúc
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   */
  async assign(
    actor: Actor,
    horseId: string,
    body: AssignGroomDto,
  ): Promise<GroomAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const { response, changedEvent } = await this.dataSource.transaction((manager) =>
      this.assignInTransaction(manager, caller.id, horseId, body.groomId),
    );
    if (changedEvent) this.events.publish(GROOM_ASSIGNMENT_CHANGED_EVENT, changedEvent);
    return response;
  }

  /**
   * Giao hoặc đổi groom cho ngựa, chạy trong transaction của nơi gọi (luật như assign)
   *
   * - Không phát event; nơi gọi phát GROOM_ASSIGNMENT_CHANGED_EVENT với changedEvent trả về sau khi commit
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @param groomId UUID của groom được giao
   * @returns Promise chứa phân công groom đang mở và event cần phát (null nếu không đổi gì)
   * @throws BadRequestException Nếu groom không có hoặc không phải Groom
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, khu không hoạt động, groom không còn hoạt động, groom mới đã có checklist trùng ngày, hoặc có thao tác khác chạy cùng lúc
   */
  async assignInTransaction(
    manager: EntityManager,
    callerId: string,
    horseId: string,
    groomId: string,
  ): Promise<{
    response: GroomAssignmentResponseDto;
    changedEvent: GroomAssignmentChangedEvent | null;
  }> {
    return this.saveUnique(async () => {
      const groom = await manager.findOne(UserEntity, {
        where: { id: groomId },
        lock: { mode: 'pessimistic_write' },
      });
      const horse = await this.access.lockOperableHorse(
        manager,
        callerId,
        horseId,
        'GROOM',
      );
      await this.access.lockActiveBarn(manager, horse.barnId);
      assertAssignableGroom(groom);
      const current = await manager.findOne(GroomAssignmentEntity, {
        where: { horseId, endAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (current?.groomId === groom.id) {
        return {
          response: toGroomAssignmentResponse({ ...current, groom }),
          changedEvent: null,
        };
      }
      const now = new Date();
      let movedChecklistIds: string[] = [];
      if (current) {
        await manager.update(
          GroomAssignmentEntity,
          { id: current.id },
          { endAt: now },
        );
        movedChecklistIds =
          await this.dailyChecklists.moveOpenChecklistsToGroom(
            manager,
            horseId,
            current.groomId,
            groom.id,
            clubToday(),
          );
      }
      const movedParticipantIds =
        await this.training.moveFutureParticipantsToGroom(
          manager,
          horseId,
          current?.groomId ?? null,
          groom.id,
          now,
        );
      const saved = await manager.save(
        manager.create(GroomAssignmentEntity, {
          horseId,
          groomId: groom.id,
          startAt: now,
          endAt: null,
        }),
      );
      await this.auditService.record(manager, {
        actorId: callerId,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.GROOM_ASSIGNMENT,
        entityId: saved.id,
        before: {
          horseId,
          groomId: current?.groomId ?? null,
          endedAssignmentId: current?.id ?? null,
        },
        after: {
          horseId,
          groomId: groom.id,
          movedChecklistIds,
          movedParticipantIds,
        },
        feature: 'F1.7',
      });
      const changed: GroomAssignmentChangedEvent = {
        eventId: saved.id,
        horseId,
        newGroomId: groom.id,
        previousGroomId: current?.groomId ?? null,
      };
      return {
        response: toGroomAssignmentResponse({ ...saved, groom }),
        changedEvent: changed,
      };
    });
  }

  /**
   * Đóng phân công groom đang mở của một con ngựa. Dùng cho module horses khi chuyển nhượng hoặc xóa hồ sơ.
   *
   * - Chạy trong transaction của nơi gọi, không tự mở transaction và không ghi nhật ký (nơi gọi tự ghi cho thao tác chính).
   * - Lock phân công đang mở trước khi đóng. Checklist của groom cũ giữ nguyên.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise chứa UUID groom vừa kết thúc phân công, hoặc null nếu ngựa không có groom phụ trách
   */
  async endOpenGroomAssignment(
    manager: EntityManager,
    horseId: string,
  ): Promise<string | null> {
    const current = await manager.findOne(GroomAssignmentEntity, {
      where: { horseId, endAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) return null;
    await manager.update(
      GroomAssignmentEntity,
      { id: current.id },
      { endAt: new Date() },
    );
    return current.groomId;
  }

  /**
   * Liệt kê mọi Groom đang hoạt động kèm số ngựa mỗi người đang phụ trách trên toàn câu lạc bộ.
   *
   * - Chỉ đếm phân công groom đang mở của ngựa chưa bị xóa.
   * - Groom chưa phụ trách ngựa nào vẫn có mặt với số đếm 0.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise chứa danh sách groom, nhiều ngựa nhất đứng trước
   */
  async listWorkload(actor: Actor): Promise<GroomWorkloadResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const rows: {
      groomId: string;
      fullName: string;
      activeHorseCount: number;
    }[] = await this.dataSource.manager.query(
      `SELECT u.id AS "groomId",
                u.full_name AS "fullName",
                COUNT(h.id)::int AS "activeHorseCount"
           FROM users u
           LEFT JOIN groom_assignments ga
             ON ga.groom_id = u.id AND ga.end_at IS NULL
           LEFT JOIN horses h
             ON h.id = ga.horse_id AND h.deleted_at IS NULL
          WHERE u.role = $1
            AND u.status = $2
            AND u.deleted_at IS NULL
          GROUP BY u.id, u.full_name
          ORDER BY "activeHorseCount" DESC, u.full_name ASC`,
      [UserRole.GROOM, UserStatus.ACTIVE],
    );
    return rows.map(toGroomWorkloadResponse);
  }

  /**
   * Chạy thao tác đổi groom và đổi lỗi unique violation thành 409 có thông báo rõ ràng.
   *
   * @param operation Thao tác ghi cần chạy
   * @returns Promise chứa kết quả của thao tác
   * @throws ConflictException Nếu ngựa vừa được giao groom khác hoặc groom mới vừa có checklist trùng ngày
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const driverError =
        error instanceof QueryFailedError
          ? (error.driverError as { code?: string; constraint?: string })
          : undefined;
      if (driverError?.code === '23505') {
        const message = GROOM_CONFLICT_MESSAGES[driverError.constraint ?? ''];
        if (message) throw new ConflictException(message);
      }
      throw error;
    }
  }
}
