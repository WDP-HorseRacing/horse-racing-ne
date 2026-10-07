import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { BarnStatus } from '../constants/barn-status.enum';
import { STABLE_AUDIT_FEATURE } from '../constants/stable-audit.constants';
import {
  BarnListItemDto,
  BarnResponseDto,
  CreateBarnDto,
  UpdateBarnDto,
} from '../dto/barn.dto';
import { BarnEntity } from '../entities/barn.entity';
import { StallEntity } from '../entities/stall.entity';
import { toBarnListItem, toBarnResponse } from '../mappers/barn.mapper';
import {
  assertAssignableHeadTrainer,
  assertBarnChangeKeepsHorses,
  assertBarnHasHeadTrainer,
  assertBarnHasRoomForHorse,
  assertCapacityFitsStalls,
  assertBarnRemovable,
  changedFieldsDiff,
  EMPTY_CAPACITY,
  isActiveHeadTrainer,
  remainingStallCount,
} from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';

@Injectable()
export class BarnsService {
  constructor(
    @InjectRepository(BarnEntity)
    private readonly barnRepository: Repository<BarnEntity>,
    private readonly dataSource: DataSource,
    private readonly access: StableAccessService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê các khu chuồng kèm Head Trainer phụ trách và số chỗ còn nhận ngựa.
   *
   * - Ô trống: ô AVAILABLE, chưa xóa và không có phân công đang mở.
   * - Ngựa chờ xếp ô: ngựa thuộc khu (horses.barn_id), chưa xóa mềm, lifecycle khác TRANSFERRED và không có phân công ô đang mở.
   * - Số chỗ còn nhận = ô trống − ngựa chờ xếp ô, không nhỏ hơn 0.
   * - hasActiveHeadTrainer: Head Trainer phụ trách còn ACTIVE và còn vai trò HEAD_TRAINER (điều kiện để xếp ngựa vào khu).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise chứa danh sách khu, sắp theo tên
   */
  async list(actor: Actor): Promise<BarnListItemDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const barns = await this.barnRepository.find({
      relations: { headTrainer: true },
      order: { name: 'ASC' },
    });
    const capacities = await this.access.countStallCapacity(
      this.dataSource.manager,
      barns.map((barn) => barn.id),
    );
    return barns.map((barn) => {
      const capacity = capacities.get(barn.id) ?? EMPTY_CAPACITY;
      return toBarnListItem(
        barn,
        isActiveHeadTrainer(barn.headTrainer),
        remainingStallCount(capacity),
        capacity.pendingStallHorseCount,
      );
    });
  }

  /**
   * Get barn details by ID
   * @param actor The actor resolved from the JWT
   * @param barnId The ID of the barn
   * @returns A promise resolving to the barn
   * @throws NotFoundException if the barn is not found
   */
  async get(actor: Actor, barnId: string): Promise<BarnResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const barn = await this.barnRepository.findOneBy({ id: barnId });
    if (!barn) throw new NotFoundException('Không tìm thấy khu chuồng');
    return toBarnResponse(barn);
  }

  /**
   * Thêm khu chuồng mới, chưa có Head Trainer phụ trách
   *
   * - Chạy trong transaction: kiểm tên, lưu khu và ghi nhật ký cùng commit hoặc cùng rollback
   * - Tên khu phải chưa tồn tại (khu đã xóa không tính); status mặc định ACTIVE
   * - Ghi nhật ký CREATE, before null, after là các field vừa tạo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin khu chuồng
   * @returns Promise trả về khu chuồng vừa tạo
   * @throws ConflictException Nếu tên khu đã tồn tại
   */
  async create(actor: Actor, body: CreateBarnDto): Promise<BarnResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const createBarn = () =>
      this.dataSource.transaction(async (manager) => {
        const name = body.name.trim();
        if (await manager.existsBy(BarnEntity, { name })) {
          throw new ConflictException('Tên khu chuồng đã tồn tại');
        }

        const fields = {
          name,
          description: body.description?.trim() ?? null,
          capacity: body.capacity ?? null,
          status: body.status ?? BarnStatus.ACTIVE,
          headTrainerId: null,
        };
        const barn = await manager.save(manager.create(BarnEntity, fields));
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.BARN,
          entityId: barn.id,
          before: null,
          after: fields,
          feature: STABLE_AUDIT_FEATURE.BARN,
        });
        return barn;
      });
    const saved = await mapAnyUniqueViolation(
      createBarn,
      'Tên khu chuồng đã tồn tại',
    );
    return toBarnResponse(saved);
  }

  /**
   * Sửa thông tin khu chuồng: tên, mô tả, sức chứa, trạng thái, Head Trainer phụ trách
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) trước khi kiểm luật
   * - Head Trainer mới phải là user HEAD_TRAINER đang ACTIVE; gửi null để gỡ người phụ trách
   * - Khu còn ngựa (horses.barn_id, hồ sơ chưa xóa) thì chặn: chuyển sang CLOSED hoặc MAINTENANCE, gỡ Head Trainer
   * - Mọi khu, dù còn ngựa hay không: chặn hạ sức chứa xuống dưới số ô hiện có
   * - Ghi nhật ký UPDATE với before/after của các field thực sự đổi; không field nào đổi thì không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param barnId UUID của khu chuồng
   * @param body Các field cần đổi
   * @returns Promise trả về khu chuồng sau khi sửa
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws BadRequestException Nếu Head Trainer mới không có hoặc không phải HEAD_TRAINER
   * @throws ConflictException Nếu Head Trainer mới không còn hoạt động, tên khu đã tồn tại, sức chứa mới nhỏ hơn số ô hiện có, hoặc khu còn ngựa mà thay đổi thuộc trường hợp bị chặn
   */
  async update(
    actor: Actor,
    barnId: string,
    body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const updateBarn = () =>
      this.dataSource.transaction(async (manager) => {
        const barn = await this.access.lockBarn(manager, barnId);

        if (body.headTrainerId) {
          assertAssignableHeadTrainer(
            await manager.findOne(UserEntity, {
              where: { id: body.headTrainerId },
            }),
          );
        }

        assertBarnChangeKeepsHorses({
          hasHorses: await manager.exists(HorseEntity, { where: { barnId } }),
          currentStatus: barn.status,
          nextStatus: body.status,
          currentHeadTrainerId: barn.headTrainerId,
          nextHeadTrainerId: body.headTrainerId,
        });
        if (body.capacity !== undefined) {
          assertCapacityFitsStalls(
            await this.access.countStallsInBarn(manager, barnId),
            body.capacity,
          );
        }

        const diff = changedFieldsDiff<Partial<BarnEntity>>(barn, {
          name: body.name?.trim(),
          headTrainerId: body.headTrainerId,
          description:
            body.description !== undefined
              ? (body.description?.trim() ?? null)
              : undefined,
          capacity: body.capacity,
          status: body.status,
        });
        if (!diff) return barn;

        Object.assign(barn, diff.after);
        const updated = await manager.save(barn);
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.BARN,
          entityId: barn.id,
          before: diff.before,
          after: diff.after,
          feature: STABLE_AUDIT_FEATURE.BARN,
        });
        return updated;
      });
    const saved = await mapAnyUniqueViolation(
      updateBarn,
      'Tên khu chuồng đã tồn tại',
    );
    return toBarnResponse(saved);
  }

  /**
   * Xóa mềm một khu chuồng
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) trước khi kiểm luật
   * - Chặn khi khu còn ngựa (horses.barn_id, hồ sơ chưa xóa) hoặc còn ô chuồng chưa xóa
   * - Ghi nhật ký DELETE với thông tin khu trước khi xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param barnId UUID của khu cần xóa
   * @returns Promise hoàn tất khi đã xóa
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws ConflictException Nếu khu còn ngựa hoặc còn ô chuồng
   */
  async remove(actor: Actor, barnId: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    await this.dataSource.transaction(async (manager) => {
      const barn = await this.access.lockBarn(manager, barnId);
      assertBarnRemovable(
        await manager.exists(HorseEntity, { where: { barnId } }),
        await manager.exists(StallEntity, { where: { barnId } }),
      );
      await manager.softDelete(BarnEntity, { id: barnId });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.BARN,
        entityId: barn.id,
        before: {
          name: barn.name,
          status: barn.status,
          capacity: barn.capacity,
          headTrainerId: barn.headTrainerId,
        },
        after: null,
        feature: STABLE_AUDIT_FEATURE.BARN,
      });
    });
  }

  /**
   * Chuyển mọi khu chuồng đang do một Head Trainer phụ trách sang Head Trainer khác, chạy trong transaction của nơi gọi
   *
   * - Khóa từng khu trước khi đổi; khu đã xóa mềm không tính
   * - Mỗi khu ghi một dòng nhật ký UPDATE headTrainerId
   * - Không kiểm quyền và không kiểm người nhận, nơi gọi tự kiểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actorId UUID người thực hiện bàn giao
   * @param fromHeadTrainerId UUID Head Trainer bàn giao
   * @param toHeadTrainerId UUID Head Trainer nhận
   * @returns Promise trả về số khu đã chuyển
   */
  async reassignHeadTrainerBarns(
    manager: EntityManager,
    actorId: string,
    fromHeadTrainerId: string,
    toHeadTrainerId: string,
  ): Promise<number> {
    const barns = await manager.find(BarnEntity, {
      where: { headTrainerId: fromHeadTrainerId },
      order: { name: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const barn of barns) {
      barn.headTrainerId = toHeadTrainerId;
      await manager.save(barn);
      await this.auditService.record(manager, {
        actorId,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.BARN,
        entityId: barn.id,
        before: { headTrainerId: fromHeadTrainerId },
        after: { headTrainerId: toHeadTrainerId },
        feature: STABLE_AUDIT_FEATURE.BARN,
      });
    }
    return barns.length;
  }

  /**
   * Lock một khu chuồng và kiểm tra khu đủ điều kiện để Club Manager xếp ngựa vào. Dùng cho module horses.
   *
   * - Chạy trong transaction của nơi gọi, không tự mở transaction.
   * - Lock row khu trước rồi mới đếm.
   * - Khu phải tồn tại, chưa xóa, đang ACTIVE, đã có Head Trainer phụ trách và còn ít nhất một chỗ nhận ngựa.
   * - Head Trainer phụ trách phải là user chưa xóa, đang ACTIVE và còn vai trò HEAD_TRAINER.
   * - Số chỗ còn nhận = ô trống − ngựa chờ xếp ô trong khu (xem `StableAccessService.countStallCapacity`).
   *
   * @param manager EntityManager của transaction đang chạy
   * @param barnId UUID của khu chuồng
   * @returns Promise chứa khu chuồng đã lock (pessimistic_write)
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws ConflictException Nếu khu không hoạt động, chưa có Head Trainer phụ trách, Head Trainer không còn hoạt động hoặc đã hết chỗ nhận ngựa
   */
  async lockAssignableBarn(
    manager: EntityManager,
    barnId: string,
  ): Promise<BarnEntity> {
    const barn = await this.access.lockActiveBarn(manager, barnId);
    assertBarnHasHeadTrainer(barn);
    const isHeadTrainerActive = await manager.exists(UserEntity, {
      where: {
        id: barn.headTrainerId,
        role: UserRole.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
      },
    });
    if (!isHeadTrainerActive) {
      throw new ConflictException(
        'Khu chưa có Huấn luyện viên trưởng đang hoạt động phụ trách',
      );
    }
    assertBarnHasRoomForHorse(
      await this.access.countBarnCapacity(manager, barnId),
    );
    return barn;
  }
}
