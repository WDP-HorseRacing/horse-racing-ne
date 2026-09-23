import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { StallStatus } from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';
import {
  CreateStallDto,
  MoveHorseStallDto,
  StallAssignmentResponseDto,
  StallListQueryDto,
  StallResponseDto,
  UpdateStallDto,
} from '../dto/stall.dto';
import { BarnEntity } from '../entities/barn.entity';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { StallEntity } from '../entities/stall.entity';
import {
  toStallAssignmentResponse,
  toStallResponse,
} from '../mappers/stall.mapper';
import {
  assertBarnActive,
  assertBarnHasStallRoom,
  assertFreeStallRemovable,
  assertManualStallStatusChange,
  assertStallBarnChangeable,
  changedFieldsDiff,
  EMPTY_CAPACITY,
  isStallFree,
} from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';
import { StableSharedRepository } from '../shared/stable-shared.repository';

/**
 * Ô chuồng vừa được trả lại khi đóng phân công ô của một con ngựa.
 */
export interface ReleasedStall {
  stallId: string;
  stallCode: string;
}

/**
 * Thông báo 409 cho từng unique index mà việc xếp ô có thể vi phạm khi hai thao tác chạy cùng lúc.
 */
const STALL_ASSIGNMENT_CONFLICT_MESSAGES: Record<string, string> = {
  stall_assignments_active_stall_uq:
    'Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống',
  stall_assignments_active_horse_uq:
    'Ngựa vừa được xếp vào ô khác, vui lòng tải lại',
};

/**
 * Thông báo 409 khi ô được chọn không còn trống và cả khu của ngựa cũng không còn ô trống nào (F1.7 E4).
 */
const BARN_OUT_OF_STALLS_MESSAGE =
  'Khu đã hết ô trống, đề nghị Club Manager đổi khu cho ngựa';

@Injectable()
export class StallsService {
  constructor(
    @InjectRepository(StallEntity)
    private readonly stallRepository: Repository<StallEntity>,
    @InjectRepository(StallAssignmentEntity)
    private readonly stallAssignmentRepository: Repository<StallAssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly access: StableAccessService,
    private readonly stableRepository: StableSharedRepository,
  ) {}

  /**
   * List the stalls with optional filters
   * @param actor The actor resolved from the JWT
   * @param query Filters by barnId, status, type
   * @returns A promise resolving to the stalls ordered by code
   */
  async list(
    actor: Actor,
    query?: StallListQueryDto,
  ): Promise<StallResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);

    const where: FindOptionsWhere<StallEntity> = {};
    if (query?.barnId) where.barnId = query.barnId;
    if (query?.status) where.status = query.status;
    if (query?.type) where.type = query.type;

    const stalls = await this.stallRepository.find({
      where,
      order: { code: 'ASC' },
    });
    return stalls.map((stall) => toStallResponse(stall));
  }

  /**
   * Get stall details by ID
   * @param actor The actor resolved from the JWT
   * @param id The ID of the stall
   * @returns A promise resolving to the stall
   * @throws NotFoundException if the stall is not found
   */
  async get(actor: Actor, id: string): Promise<StallResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const stall = await this.stallRepository.findOneBy({ id });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
    return toStallResponse(stall);
  }

  /**
   * Tạo ô chuồng mới trong một khu (F1.6). Ô mới luôn ở trạng thái AVAILABLE
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) trước khi đếm số ô, để hai request thêm ô cùng lúc không vượt sức chứa
   * - Khu phải đang ACTIVE và còn chỗ theo sức chứa (khu không đặt sức chứa thì không giới hạn)
   * - Mã ô phải chưa tồn tại (ô đã xóa không tính)
   * - Ghi nhật ký CREATE, before null, after là các field vừa tạo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin ô chuồng
   * @returns A promise resolving to ô chuồng vừa tạo
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws BadRequestException Nếu khu không ở trạng thái hoạt động
   * @throws ConflictException Nếu khu đã đủ sức chứa hoặc mã ô đã tồn tại
   */
  async create(actor: Actor, body: CreateStallDto): Promise<StallResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const saved = await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const barn = await this.access.lockActiveBarn(manager, body.barnId);
        assertBarnHasStallRoom(
          barn,
          await this.stableRepository.countStallsInBarn(manager, barn.id),
        );

        const code = body.code.trim();
        if (await manager.existsBy(StallEntity, { code })) {
          throw new ConflictException('Mã ô chuồng đã tồn tại');
        }

        const fields = {
          barnId: barn.id,
          code,
          type: body.type ?? StallType.STANDARD,
          status: StallStatus.AVAILABLE,
          description: body.description?.trim() ?? null,
          hasCamera: body.hasCamera ?? false,
        };
        const stall = await manager.save(manager.create(StallEntity, fields));
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.STALL,
          entityId: stall.id,
          before: null,
          after: fields,
          feature: 'F1.7',
        });
        return stall;
      }),
    );
    return toStallResponse(saved);
  }

  /**
   * Sửa thông tin ô chuồng (F1.6)
   *
   * - Chạy trong transaction, lock khu của ô (và khu đích nếu đổi khu) rồi mới lock ô, cùng thứ tự khu → ô với moveHorseToStall
   * - Đổi khu: ô không được đang có ngựa; khu đích phải ACTIVE và còn chỗ theo sức chứa
   * - Đổi trạng thái: chỉ AVAILABLE ↔ MAINTENANCE và ô không được đang có ngựa; gửi đúng trạng thái hiện tại thì bỏ qua
   * - Chuyển ô trống sang MAINTENANCE: số ô trống còn lại của khu phải đủ cho ngựa đang chờ xếp ô
   * - Ghi nhật ký UPDATE với before/after của các field thực sự đổi; không field nào đổi thì không lưu, không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ô chuồng
   * @param body Các field cần đổi
   * @returns A promise resolving to ô chuồng sau khi sửa
   * @throws NotFoundException Nếu không có ô, không có khu của ô hoặc không có khu đích
   * @throws BadRequestException Nếu khu đích không ở trạng thái hoạt động
   * @throws ConflictException Nếu mã ô đã tồn tại, khu đích đã đủ sức chứa, ô đang có ngựa mà đổi khu hoặc đổi trạng thái, trạng thái hiện tại không đổi tay được, ô vừa bị chuyển khu, hoặc chuyển ô trống sang MAINTENANCE hay sang khu khác làm khu hiện tại thiếu ô cho ngựa chờ xếp ô
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateStallDto,
  ): Promise<StallResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const saved = await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const { stall, targetBarn } = await this.lockStallWithBarns(
          manager,
          id,
          body.barnId,
        );
        const hasOpenAssignment = await manager.exists(StallAssignmentEntity, {
          where: { stallId: id, endAt: IsNull() },
        });

        if (targetBarn) {
          assertStallBarnChangeable(hasOpenAssignment);
          assertBarnActive(targetBarn, 'Khu chuồng đích');
          assertBarnHasStallRoom(
            targetBarn,
            await this.stableRepository.countStallsInBarn(
              manager,
              targetBarn.id,
            ),
            'Khu chuồng đích',
          );
          if (isStallFree(stall.status, hasOpenAssignment)) {
            await this.assertBarnKeepsStallsForPendingHorses(
              manager,
              stall.barnId,
            );
          }
        }
        if (body.status !== undefined && body.status !== stall.status) {
          assertManualStallStatusChange(stall.status, hasOpenAssignment);
          if (
            body.status === StallStatus.MAINTENANCE &&
            isStallFree(stall.status, hasOpenAssignment)
          ) {
            await this.assertBarnKeepsStallsForPendingHorses(
              manager,
              stall.barnId,
            );
          }
        }

        const diff = changedFieldsDiff<Partial<StallEntity>>(stall, {
          barnId: body.barnId,
          code: body.code?.trim(),
          type: body.type,
          status: body.status,
          description:
            body.description !== undefined
              ? (body.description?.trim() ?? null)
              : undefined,
          hasCamera: body.hasCamera,
        });
        if (!diff) return stall;

        Object.assign(stall, diff.after);
        const updated = await manager.save(stall);
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.STALL,
          entityId: stall.id,
          before: diff.before,
          after: diff.after,
          feature: 'F1.7',
        });
        return updated;
      }),
    );
    return toStallResponse(saved);
  }

  /**
   * Xóa mềm một ô chuồng đang trống
   *
   * - Chạy trong transaction, lock khu của ô rồi mới lock ô (pessimistic_write), cùng thứ tự khu → ô với moveHorseToStall
   * - Ô đang có dòng xếp ô mở thì không xóa
   * - Ô đang trống (AVAILABLE, không có dòng xếp mở): số ô trống còn lại của khu phải đủ cho ngựa đang chờ xếp ô
   * - Ghi nhật ký DELETE với thông tin ô trước khi xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ô chuồng
   * @returns A promise resolving khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ô chuồng hoặc không có khu của ô
   * @throws ConflictException Nếu ô đang có ngựa, ô vừa bị chuyển khu, hoặc xóa ô làm khu thiếu ô cho ngựa chờ xếp ô
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    await this.dataSource.transaction(async (manager) => {
      const { stall } = await this.lockStallWithBarns(manager, id);

      const hasActiveAssignment = await manager.exists(StallAssignmentEntity, {
        where: { stallId: id, endAt: IsNull() },
      });
      if (hasActiveAssignment) {
        throw new ConflictException(
          'Không thể xóa ô chuồng đang có ngựa phân công',
        );
      }
      if (isStallFree(stall.status, hasActiveAssignment)) {
        await this.assertBarnKeepsStallsForPendingHorses(manager, stall.barnId);
      }

      await manager.softDelete(StallEntity, { id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.STALL,
        entityId: stall.id,
        before: {
          barnId: stall.barnId,
          code: stall.code,
          type: stall.type,
          status: stall.status,
          description: stall.description,
          hasCamera: stall.hasCamera,
        },
        after: null,
        feature: 'F1.7',
      });
    });
  }

  /**
   * List assignment history for a stall
   * @param actor The actor resolved from the JWT
   * @param stallId The ID of the stall
   * @returns A promise resolving to the assignment history
   * @throws NotFoundException if the stall is not found
   */
  async listAssignments(
    actor: Actor,
    stallId: string,
  ): Promise<StallAssignmentResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);

    const stallExists = await this.stallRepository.existsBy({ id: stallId });
    if (!stallExists) throw new NotFoundException('Không tìm thấy ô chuồng');

    const assignments = await this.stallAssignmentRepository.find({
      where: { stallId },
      relations: ['horse'],
      order: { startAt: 'DESC' },
    });
    return assignments.map((assignment) =>
      toStallAssignmentResponse(assignment),
    );
  }

  /**
   * Xếp ngựa vào một ô chuồng hoặc chuyển sang ô khác trong cùng khu (F1.7).
   *
   * - Chỉ Head Trainer phụ trách khu của ngựa (horses.barn_id) được thao tác, kể cả khi người gọi có thêm vai trò khác.
   * - Ngựa phải đã được Club Manager xếp khu, chưa chuyển nhượng và chưa bị xóa. Ngựa đã giải nghệ vẫn xếp ô được.
   * - Lock khu của ngựa (pessimistic_write), khu phải đang ACTIVE.
   * - Ô đích phải thuộc đúng khu của ngựa, đang AVAILABLE và không có phân công đang mở.
   * - Đang ở ô khác thì đóng phân công cũ, trả ô cũ về AVAILABLE và mở phân công mới trong cùng transaction.
   * - Chọn lại đúng ô đang ở thì không thay đổi gì.
   * - Không đụng tới groom phụ trách. Ghi nhật ký cho phân công đóng và phân công mở.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Ô chuồng đích
   * @returns Promise chứa phân công ô đang mở của ngựa sau thao tác
   * @throws NotFoundException Nếu không có ngựa, không có khu hoặc không có ô chuồng
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, hoặc ô đích không còn trống (khu hết ô trống thì báo đề nghị Club Manager đổi khu)
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   * @throws BadRequestException Nếu ô đích không thuộc khu của ngựa hoặc khu không hoạt động
   */
  async moveHorseToStall(
    actor: Actor,
    horseId: string,
    body: MoveHorseStallDto,
  ): Promise<StallAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    return this.runAssignmentUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const horse = await this.access.lockOperableHorse(
          manager,
          caller.id,
          horseId,
          'STALL',
        );
        await this.access.lockActiveBarn(manager, horse.barnId);

        const current = await manager.findOne(StallAssignmentEntity, {
          where: { horseId, endAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (current?.stallId === body.stallId) {
          return toStallAssignmentResponse({ ...current, horse });
        }

        const stall = await manager.findOne(StallEntity, {
          where: { id: body.stallId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
        if (stall.barnId !== horse.barnId) {
          throw new BadRequestException(
            'Ô chuồng không thuộc khu chuồng của ngựa',
          );
        }
        const isStallOccupied = await manager.exists(StallAssignmentEntity, {
          where: { stallId: stall.id, endAt: IsNull() },
        });
        if (!isStallFree(stall.status, isStallOccupied)) {
          const capacity =
            (
              await this.stableRepository.countStallCapacity(manager, [
                horse.barnId,
              ])
            ).get(horse.barnId) ?? EMPTY_CAPACITY;
          throw new ConflictException(
            capacity.freeStallCount > 0
              ? STALL_ASSIGNMENT_CONFLICT_MESSAGES.stall_assignments_active_stall_uq
              : BARN_OUT_OF_STALLS_MESSAGE,
          );
        }

        const now = new Date();
        if (current) {
          await this.closeAssignment(manager, current, now);
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.STALL_ASSIGNMENT,
            feature: 'F1.7',
            entityId: current.id,
            before: { horseId, stallId: current.stallId, endAt: null },
            after: { horseId, stallId: current.stallId, endAt: now },
          });
        }

        const saved = await manager.save(
          manager.create(StallAssignmentEntity, {
            stallId: stall.id,
            horseId,
            startAt: now,
            endAt: null,
          }),
        );
        await manager.update(
          StallEntity,
          { id: stall.id },
          { status: StallStatus.OCCUPIED },
        );
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.STALL_ASSIGNMENT,
          feature: 'F1.7',
          entityId: saved.id,
          before: null,
          after: {
            horseId,
            stallId: stall.id,
            stallCode: stall.code,
            previousStallId: current?.stallId ?? null,
            startAt: now,
          },
        });

        return toStallAssignmentResponse({ ...saved, horse });
      }),
    );
  }

  /**
   * Đóng phân công ô đang mở của một con ngựa và trả ô về trống. Dùng cho module horses khi đổi khu, chuyển nhượng hoặc xóa hồ sơ.
   *
   * - Chạy trong transaction của nơi gọi, không tự mở transaction và không ghi nhật ký (nơi gọi tự ghi cho thao tác chính).
   * - Lock phân công đang mở trước khi đóng.
   * - Ô đang OCCUPIED thì chuyển về AVAILABLE; ô đang ở trạng thái khác (vd MAINTENANCE) thì giữ nguyên.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise chứa ô vừa được trả, hoặc null nếu ngựa không có phân công ô đang mở
   */
  async releaseStallByHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<ReleasedStall | null> {
    const current = await manager.findOne(StallAssignmentEntity, {
      where: { horseId, endAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) return null;
    const stall = await this.closeAssignment(manager, current, new Date());
    return { stallId: stall.id, stallCode: stall.code };
  }

  /**
   * Kết thúc một phân công ô đang mở và trả ô về trống (F1.7).
   *
   * - Chỉ Head Trainer phụ trách khu của ngựa (horses.barn_id) được thao tác, kể cả khi người gọi có thêm vai trò khác (Club Manager không xếp ô).
   * - Chạy trong một transaction: lock phân công (pessimistic_write) rồi mới kiểm tra đã kết thúc hay chưa, để hai request đóng cùng lúc chạy lần lượt.
   * - Lock ô chuồng trước khi đổi trạng thái; chỉ trả ô về AVAILABLE khi ô đang OCCUPIED và không còn phân công mở nào khác.
   * - Ghi nhật ký UPDATE cho phân công (endAt, mã ô).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assignmentId UUID của phân công ô
   * @returns Promise chứa phân công vừa kết thúc
   * @throws NotFoundException Nếu không có phân công
   * @throws ForbiddenException Nếu ngựa của phân công không thuộc khu người gọi phụ trách
   * @throws ConflictException Nếu phân công đã kết thúc trước đó
   */
  async endAssignment(
    actor: Actor,
    assignmentId: string,
  ): Promise<StallAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    return this.dataSource.transaction(async (manager) => {
      const assignment = await manager.findOne(StallAssignmentEntity, {
        where: { id: assignmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) {
        throw new NotFoundException('Không tìm thấy lượt phân công chuồng');
      }
      await this.access.assertHorseInTrainerBarn(
        manager,
        assignment.horseId,
        caller.id,
      );
      if (assignment.endAt !== null) {
        throw new ConflictException(
          'Lượt phân công chuồng này đã kết thúc trước đó',
        );
      }

      const now = new Date();
      const stall = await this.closeAssignment(manager, assignment, now);
      const snapshot = {
        horseId: assignment.horseId,
        stallId: stall.id,
        stallCode: stall.code,
      };
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.STALL_ASSIGNMENT,
        feature: 'F1.7',
        entityId: assignment.id,
        before: { ...snapshot, endAt: null },
        after: { ...snapshot, endAt: now },
      });

      const horse = await manager.findOneOrFail(HorseEntity, {
        where: { id: assignment.horseId },
        withDeleted: true,
      });
      return toStallAssignmentResponse({ ...assignment, endAt: now, horse });
    });
  }

  /**
   * Đóng một phân công ô đang mở và trả ô về AVAILABLE nếu ô đang OCCUPIED và không còn phân công mở nào khác.
   *
   * - Lock ô chuồng (pessimistic_write) trước khi đổi trạng thái.
   *
   * @param manager EntityManager của transaction đang chạy
   * @param assignment Phân công ô đang mở (đã lock)
   * @param endAt Thời điểm kết thúc phân công
   * @returns Promise chứa ô chuồng của phân công vừa đóng
   */
  private async closeAssignment(
    manager: EntityManager,
    assignment: StallAssignmentEntity,
    endAt: Date,
  ): Promise<StallEntity> {
    await manager.update(
      StallAssignmentEntity,
      { id: assignment.id },
      { endAt },
    );
    const stall = await manager.findOneOrFail(StallEntity, {
      where: { id: assignment.stallId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    const hasOtherOpenAssignment = await manager.exists(StallAssignmentEntity, {
      where: { stallId: stall.id, endAt: IsNull() },
    });
    if (stall.status === StallStatus.OCCUPIED && !hasOtherOpenAssignment) {
      await manager.update(
        StallEntity,
        { id: stall.id },
        { status: StallStatus.AVAILABLE },
      );
    }
    return stall;
  }

  /**
   * Lock khu của ô (và khu đích nếu đổi khu) rồi mới lock ô, cùng thứ tự khu → ô với moveHorseToStall để không deadlock
   *
   * - Đọc ô chưa lock để biết khu hiện tại, lock các khu theo UUID tăng dần (pessimistic_write), sau đó lock ô
   * - Ô bị chuyển sang khu khác giữa lúc đọc và lúc lock thì báo 409 để người dùng tải lại
   * - Không kiểm trạng thái khu; nơi cần thì tự gọi assertBarnActive
   *
   * @param manager EntityManager của transaction đang chạy
   * @param stallId UUID của ô chuồng
   * @param targetBarnId UUID khu đích khi đổi khu, undefined nếu không đổi khu
   * @returns A promise resolving to ô chuồng đã lock và khu đích đã lock (null nếu không đổi khu hoặc khu đích trùng khu hiện tại)
   * @throws NotFoundException Nếu không có ô chuồng, không có khu của ô hoặc không có khu đích
   * @throws ConflictException Nếu ô vừa bị chuyển sang khu khác
   */
  private async lockStallWithBarns(
    manager: EntityManager,
    stallId: string,
    targetBarnId?: string,
  ): Promise<{ stall: StallEntity; targetBarn: BarnEntity | null }> {
    const snapshot = await manager.findOne(StallEntity, {
      where: { id: stallId },
    });
    if (!snapshot) throw new NotFoundException('Không tìm thấy ô chuồng');

    const sourceBarnId = snapshot.barnId;
    const movingBarnId =
      targetBarnId && targetBarnId !== sourceBarnId ? targetBarnId : null;
    let targetBarn: BarnEntity | null = null;
    for (const barnId of [sourceBarnId, movingBarnId]
      .filter((value): value is string => value !== null)
      .sort()) {
      const barn = await this.access.lockBarn(
        manager,
        barnId,
        barnId === movingBarnId
          ? 'Không tìm thấy khu chuồng đích'
          : 'Không tìm thấy khu chuồng',
      );
      if (barnId === movingBarnId) targetBarn = barn;
    }

    const stall = await manager.findOne(StallEntity, {
      where: { id: stallId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
    if (stall.barnId !== sourceBarnId) {
      throw new ConflictException(
        'Ô chuồng vừa được chuyển sang khu khác, vui lòng tải lại',
      );
    }
    return { stall, targetBarn };
  }

  /**
   * Chặn đưa một ô trống ra khỏi danh sách ô trống của khu khi khu không còn đủ ô cho ngựa đang chờ xếp ô
   *
   * - Nơi gọi phải đã lock khu (pessimistic_write) và chỉ gọi khi ô đang trống
   * - Đếm ô trống và ngựa chờ xếp ô như countStallCapacity / lockAssignableBarn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param barnId UUID khu của ô
   * @returns A promise resolving khi kiểm tra xong
   * @throws ConflictException Nếu bỏ ô này thì số ô trống còn lại ít hơn số ngựa chờ xếp ô
   */
  private async assertBarnKeepsStallsForPendingHorses(
    manager: EntityManager,
    barnId: string,
  ): Promise<void> {
    const capacity =
      (await this.stableRepository.countStallCapacity(manager, [barnId])).get(
        barnId,
      ) ?? EMPTY_CAPACITY;
    assertFreeStallRemovable(capacity);
  }

  /**
   * Chạy thao tác xếp ô và đổi lỗi unique violation thành 409 có thông báo rõ ràng.
   *
   * @param operation Thao tác ghi cần chạy
   * @returns Promise chứa kết quả của thao tác
   * @throws ConflictException Nếu ô hoặc ngựa vừa được xếp bởi thao tác khác
   */
  private async runAssignmentUnique<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const driverError =
        error instanceof QueryFailedError
          ? (error.driverError as { code?: string; constraint?: string })
          : undefined;
      if (driverError?.code === '23505') {
        const message =
          STALL_ASSIGNMENT_CONFLICT_MESSAGES[driverError.constraint ?? ''];
        if (message) throw new ConflictException(message);
      }
      throw error;
    }
  }

  /**
   * Run a write operation and map a unique violation to a stall code conflict
   * @param operation The write operation to run
   * @returns A promise resolving to the operation result
   * @throws ConflictException if the stall code is already used
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException('Mã ô chuồng đã tồn tại');
      }
      throw error;
    }
  }
}
