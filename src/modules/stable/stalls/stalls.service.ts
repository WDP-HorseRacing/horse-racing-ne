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
  Repository,
} from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  mapAnyUniqueViolation,
  mapUniqueViolation,
} from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { StallStatus } from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';
import { STABLE_AUDIT_FEATURE } from '../constants/stable-audit.constants';
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
  isStallFree,
} from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';

/**
 * Ô chuồng vừa được trả lại khi đóng phân công ô của một con ngựa.
 */
export interface ReleasedStall {
  stallId: string;
  stallCode: string;
}

/**
 * Thông báo 409 khi ô được chọn vừa bị ngựa khác chiếm nhưng khu vẫn còn ô trống khác
 */
const STALL_TAKEN_MESSAGE = 'Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống';

/**
 * Thông báo 409 cho từng unique index mà việc xếp ô có thể vi phạm khi hai thao tác chạy cùng lúc.
 */
const STALL_ASSIGNMENT_CONFLICT_MESSAGES: Record<string, string> = {
  stall_assignments_active_stall_uq: STALL_TAKEN_MESSAGE,
  stall_assignments_active_horse_uq:
    'Ngựa vừa được xếp vào ô khác, vui lòng tải lại',
};

/**
 * Thông báo 409 khi ô được chọn không còn trống và cả khu của ngựa cũng không còn ô trống nào.
 */
const BARN_OUT_OF_STALLS_MESSAGE =
  'Khu đã hết ô trống, đề nghị Quản lý câu lạc bộ đổi khu cho ngựa';

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
   * Tạo ô chuồng mới trong một khu. Ô mới luôn ở trạng thái AVAILABLE
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) rồi mới đếm số ô
   * - Khu phải đang ACTIVE và còn chỗ theo sức chứa (khu không đặt sức chứa thì không giới hạn)
   * - Mã ô phải chưa tồn tại (ô đã xóa không tính)
   * - Ghi nhật ký CREATE, before null, after là các field vừa tạo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin ô chuồng
   * @returns Promise trả về ô chuồng vừa tạo
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws ConflictException Nếu khu không ở trạng thái hoạt động, khu đã đủ sức chứa hoặc mã ô đã tồn tại
   */
  async create(actor: Actor, body: CreateStallDto): Promise<StallResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const createStall = () =>
      this.dataSource.transaction(async (manager) => {
        const barn = await this.access.lockActiveBarn(manager, body.barnId);
        assertBarnHasStallRoom(
          barn,
          await this.access.countStallsInBarn(manager, barn.id),
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
          feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
        });
        return stall;
      });
    const saved = await mapAnyUniqueViolation(
      createStall,
      'Mã ô chuồng đã tồn tại',
    );
    return toStallResponse(saved);
  }

  /**
   * Sửa thông tin ô chuồng
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
   * @returns Promise trả về ô chuồng sau khi sửa
   * @throws NotFoundException Nếu không có ô, không có khu của ô hoặc không có khu đích
   * @throws ConflictException Nếu khu đích không ở trạng thái hoạt động, mã ô đã tồn tại, khu đích đã đủ sức chứa, ô đang có ngựa mà đổi khu hoặc đổi trạng thái, trạng thái hiện tại không đổi tay được, ô vừa bị chuyển khu, hoặc chuyển ô trống sang MAINTENANCE hay sang khu khác làm khu hiện tại thiếu ô cho ngựa chờ xếp ô
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateStallDto,
  ): Promise<StallResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const updateStall = () =>
      this.dataSource.transaction(async (manager) => {
        const { stall, targetBarn } = await this.lockStallWithBarns(
          manager,
          id,
          body.barnId,
        );
        const hasOpenAssignment = await this.hasOpenStallAssignment(
          manager,
          id,
        );

        if (targetBarn) {
          assertStallBarnChangeable(hasOpenAssignment);
          assertBarnActive(targetBarn, 'Khu chuồng đích');
          assertBarnHasStallRoom(
            targetBarn,
            await this.access.countStallsInBarn(manager, targetBarn.id),
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
          feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
        });
        return updated;
      });
    const saved = await mapAnyUniqueViolation(
      updateStall,
      'Mã ô chuồng đã tồn tại',
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
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ô chuồng hoặc không có khu của ô
   * @throws ConflictException Nếu ô đang có ngựa, ô vừa bị chuyển khu, hoặc xóa ô làm khu thiếu ô cho ngựa chờ xếp ô
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    await this.dataSource.transaction(async (manager) => {
      const { stall } = await this.lockStallWithBarns(manager, id);

      const hasOpenAssignment = await this.hasOpenStallAssignment(manager, id);
      if (hasOpenAssignment) {
        throw new ConflictException(
          'Không thể xóa ô chuồng đang có ngựa phân công',
        );
      }
      if (isStallFree(stall.status, hasOpenAssignment)) {
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
        feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
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
   * Xếp ngựa vào một ô chuồng hoặc chuyển sang ô khác trong cùng khu.
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
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, khu không hoạt động, ô đích không còn trống (khu hết ô trống thì báo đề nghị Quản lý câu lạc bộ đổi khu) hoặc có thao tác khác chạy cùng lúc
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   * @throws BadRequestException Nếu ô đích không thuộc khu của ngựa
   */
  async moveHorseToStall(
    actor: Actor,
    horseId: string,
    body: MoveHorseStallDto,
  ): Promise<StallAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    return this.dataSource.transaction((manager) =>
      this.moveHorseToStallInTransaction(
        manager,
        caller.id,
        horseId,
        body.stallId,
      ),
    );
  }

  /**
   * Xếp ngựa vào một ô chuồng hoặc chuyển ô, chạy trong transaction của nơi gọi (luật như moveHorseToStall)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @param stallId UUID của ô chuồng đích
   * @returns Promise chứa phân công ô đang mở của ngựa sau thao tác
   * @throws NotFoundException Nếu không có ngựa, không có khu hoặc không có ô chuồng
   * @throws ForbiddenException Nếu người gọi không phụ trách khu của ngựa
   * @throws BadRequestException Nếu ô đích không thuộc khu của ngựa
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, khu không hoạt động, ô đích không còn trống hoặc có thao tác khác chạy cùng lúc
   */
  async moveHorseToStallInTransaction(
    manager: EntityManager,
    callerId: string,
    horseId: string,
    stallId: string,
  ): Promise<StallAssignmentResponseDto> {
    return mapUniqueViolation(async () => {
      // Kiểm tra trạng thái ngựa và người gọi có quyền thao tác trên ngựa
      const horse = await this.access.lockOperableHorse(
        manager,
        callerId,
        horseId,
        'STALL',
      );
      // Khu phải đang hoạt động 
      await this.access.lockActiveBarn(manager, horse.barnId);

      // Nếu ngựa đã được phân công ô nào rồi thì look ô đó trước
      const current = await this.lockOpenAssignmentByHorse(manager, horseId);
      if (current?.stallId === stallId) {
        return toStallAssignmentResponse({ ...current, horse });
      }

      // Lock ô đích, check thuộc đúng khu, và đang trống
      const stall = await this.lockFreeStallInBarn(
        manager,
        stallId,
        horse.barnId,
      );

      const now = new Date();
      // Nếu ngựa đã được phân công ô nào thì đóng phân công cũ
      if (current) {
        await this.closePreviousAssignmentWithAudit(
          manager,
          callerId,
          horseId,
          current,
          now,
        );
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
        actorId: callerId,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.STALL_ASSIGNMENT,
        feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
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
    }, STALL_ASSIGNMENT_CONFLICT_MESSAGES);
  }

  /**
   * Lock ô chuồng đích và kiểm ô thuộc đúng khu của ngựa, đang trống
   *
   * - Lock ô (pessimistic_write) trước khi kiểm
   * - Ô không còn trống: khu còn ô trống khác thì báo ô vừa bị chiếm, khu hết ô trống thì đề nghị Quản lý câu lạc bộ đổi khu
   *
   * @param manager EntityManager của transaction đang chạy
   * @param stallId UUID của ô chuồng đích
   * @param barnId UUID khu của ngựa
   * @returns Promise trả về ô chuồng đã lock, chắc chắn đang trống
   * @throws NotFoundException Nếu không có ô chuồng
   * @throws BadRequestException Nếu ô không thuộc khu của ngựa
   * @throws ConflictException Nếu ô không còn trống
   */
  private async lockFreeStallInBarn(
    manager: EntityManager,
    stallId: string,
    barnId: string,
  ): Promise<StallEntity> {
    const stall = await manager.findOne(StallEntity, {
      where: { id: stallId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
    if (stall.barnId !== barnId) {
      throw new BadRequestException('Ô chuồng không thuộc khu chuồng của ngựa');
    }
    // Kiểm tra ô có đang được phân công không
    const hasOpenAssignment = await this.hasOpenStallAssignment(
      manager,
      stall.id,
    );
    // Nếu ô không còn trống thì báo ô vừa bị chiếm, nếu khu hết ô trống thì đề nghị Club Manager đổi khu
    if (!isStallFree(stall.status, hasOpenAssignment)) {
      const capacity = await this.access.countBarnCapacity(manager, barnId);
      throw new ConflictException(
        capacity.freeStallCount > 0
          ? STALL_TAKEN_MESSAGE
          : BARN_OUT_OF_STALLS_MESSAGE,
      );
    }
    return stall;
  }

  /**
   * Đóng phân công ô cũ của ngựa khi chuyển sang ô khác, trả ô cũ về trống và ghi nhật ký UPDATE
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID của người gọi (users.id)
   * @param horseId UUID của ngựa
   * @param current Phân công ô đang mở của ngựa (đã lock)
   * @param now Thời điểm chuyển ô
   * @returns Promise hoàn tất khi đã đóng phân công và ghi nhật ký
   */
  private async closePreviousAssignmentWithAudit(
    manager: EntityManager,
    callerId: string,
    horseId: string,
    current: StallAssignmentEntity,
    now: Date,
  ): Promise<void> {
    await this.closeAssignmentAndFreeStall(manager, current, now);
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.STALL_ASSIGNMENT,
      feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
      entityId: current.id,
      before: { horseId, stallId: current.stallId, endAt: null },
      after: { horseId, stallId: current.stallId, endAt: now },
    });
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
  async closeOpenStallAssignment(
    manager: EntityManager,
    horseId: string,
  ): Promise<ReleasedStall | null> {
    const current = await this.lockOpenAssignmentByHorse(manager, horseId);
    if (!current) return null;
    const stall = await this.closeAssignmentAndFreeStall(
      manager,
      current,
      new Date(),
    );
    return { stallId: stall.id, stallCode: stall.code };
  }

  /**
   * Kết thúc một phân công ô đang mở và trả ô về trống.
   *
   * - Chỉ Head Trainer phụ trách khu của ngựa (horses.barn_id) được thao tác, kể cả khi người gọi có thêm vai trò khác.
   * - Chạy trong một transaction: lock phân công (pessimistic_write) rồi mới kiểm tra đã kết thúc hay chưa.
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

      return this.closeAssignmentWithAudit(manager, caller.id, assignment);
    });
  }

  /**
   * Gỡ ngựa khỏi ô chuồng đang ở, theo id ngựa thay vì id phân công
   *
   * - Chỉ Head Trainer phụ trách khu của ngựa được thao tác; ngựa đã chuyển nhượng hoặc chưa có khu trả 409
   * - Chạy trong một transaction: lock ngựa, rồi lock phân công ô đang mở của ngựa
   * - Đóng phân công, trả ô về trống và ghi nhật ký giống endAssignment
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về phân công ô vừa kết thúc
   * @throws NotFoundException Nếu không có ngựa, hoặc ngựa chưa được xếp ô chuồng
   * @throws ForbiddenException Nếu ngựa không thuộc khu người gọi phụ trách
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc chưa được xếp khu
   */
  async removeHorseFromStall(
    actor: Actor,
    horseId: string,
  ): Promise<StallAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    return this.dataSource.transaction(async (manager) => {
      await this.access.lockOperableHorse(manager, caller.id, horseId, 'STALL');
      const assignment = await this.lockOpenAssignmentByHorse(manager, horseId);
      if (!assignment) {
        throw new NotFoundException('Ngựa chưa được xếp ô chuồng');
      }
      return this.closeAssignmentWithAudit(manager, caller.id, assignment);
    });
  }

  /**
   * Đóng một phân công ô đang mở đã lock, ghi nhật ký và dựng response
   *
   * @param manager EntityManager của transaction đang chạy
   * @param callerId UUID người thao tác (users.id)
   * @param assignment Phân công ô đang mở (đã lock)
   * @returns Promise trả về phân công ô vừa kết thúc
   */
  private async closeAssignmentWithAudit(
    manager: EntityManager,
    callerId: string,
    assignment: StallAssignmentEntity,
  ): Promise<StallAssignmentResponseDto> {
    const now = new Date();
    const stall = await this.closeAssignmentAndFreeStall(
      manager,
      assignment,
      now,
    );
    const snapshot = {
      horseId: assignment.horseId,
      stallId: stall.id,
      stallCode: stall.code,
    };
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.STALL_ASSIGNMENT,
      feature: STABLE_AUDIT_FEATURE.STALL_AND_GROOM,
      entityId: assignment.id,
      before: { ...snapshot, endAt: null },
      after: { ...snapshot, endAt: now },
    });

    const horse = await manager.findOneOrFail(HorseEntity, {
      where: { id: assignment.horseId },
      withDeleted: true,
    });
    return toStallAssignmentResponse({ ...assignment, endAt: now, horse });
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
  private async closeAssignmentAndFreeStall(
    manager: EntityManager,
    assignment: StallAssignmentEntity,
    endAt: Date,
  ): Promise<StallEntity> {
    await manager.update(
      // Đóng phân công
      StallAssignmentEntity,
      { id: assignment.id },
      { endAt },
    );
    const stall = await manager.findOneOrFail(StallEntity, {
      where: { id: assignment.stallId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    // Kiểm tra coi có phải là ô còn đang được phân công không
    const hasOtherOpenAssignment = await this.hasOpenStallAssignment(
      manager,
      stall.id,
    );
    // Reset lại trạng thái ô chuồng
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
   * Lock khu của ô (và khu đích nếu đổi khu) rồi mới lock ô, cùng thứ tự khu → ô với moveHorseToStall
   *
   * - Đọc ô chưa lock để biết khu hiện tại, lock các khu theo UUID tăng dần (pessimistic_write), sau đó lock ô
   * - Ô bị chuyển sang khu khác giữa lúc đọc và lúc lock thì báo 409
   * - Không kiểm trạng thái khu; nơi cần thì tự gọi assertBarnActive
   *
   * @param manager EntityManager của transaction đang chạy
   * @param stallId UUID của ô chuồng
   * @param targetBarnId UUID khu đích khi đổi khu, undefined nếu không đổi khu
   * @returns Promise trả về ô chuồng đã lock và khu đích đã lock (null nếu không đổi khu hoặc khu đích trùng khu hiện tại)
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
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ConflictException Nếu bỏ ô này thì số ô trống còn lại ít hơn số ngựa chờ xếp ô
   */
  private async assertBarnKeepsStallsForPendingHorses(
    manager: EntityManager,
    barnId: string,
  ): Promise<void> {
    const capacity = await this.access.countBarnCapacity(manager, barnId);
    assertFreeStallRemovable(capacity);
  }

  /**
   * Kiểm tra ô chuồng có đang có phân công chưa kết thúc không
   *
   * @param manager EntityManager dùng để query (truyền manager của transaction nếu đang trong transaction)
   * @param stallId UUID của ô chuồng
   * @returns Promise trả về true nếu ô đang có phân công mở
   */
  private hasOpenStallAssignment(
    manager: EntityManager,
    stallId: string,
  ): Promise<boolean> {
    return manager.exists(StallAssignmentEntity, {
      where: { stallId, endAt: IsNull() },
    });
  }

  /**
   * Lock phân công ô đang mở của một con ngựa (pessimistic_write)
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @returns Promise trả về phân công ô đang mở đã lock, hoặc null nếu ngựa không có
   */
  private lockOpenAssignmentByHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<StallAssignmentEntity | null> {
    return manager.findOne(StallAssignmentEntity, {
      where: { horseId, endAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
