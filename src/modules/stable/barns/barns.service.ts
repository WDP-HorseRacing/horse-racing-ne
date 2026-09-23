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
  QueryFailedError,
  Repository,
} from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { BarnStatus } from '../constants/barn-status.enum';
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
  assertBarnChangeKeepsHorses,
  assertCapacityFitsStalls,
  assertBarnRemovable,
  changedFieldsDiff,
  EMPTY_CAPACITY,
  fullBarnMessage,
  isActiveHeadTrainer,
  remainingStallCount,
} from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';
import { StableSharedRepository } from '../shared/stable-shared.repository';

@Injectable()
export class BarnsService {
  constructor(
    @InjectRepository(BarnEntity)
    private readonly barnRepository: Repository<BarnEntity>,
    private readonly dataSource: DataSource,
    private readonly access: StableAccessService,
    private readonly stableRepository: StableSharedRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê các khu chuồng kèm Head Trainer phụ trách và số chỗ còn nhận ngựa (F1.6 bước 3).
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
    const capacities = await this.stableRepository.countStallCapacity(
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
   * Thêm khu chuồng mới, chưa có Head Trainer phụ trách (F1.6)
   *
   * - Chạy trong transaction: kiểm tên, lưu khu và ghi nhật ký cùng commit hoặc cùng rollback
   * - Tên khu phải chưa tồn tại (khu đã xóa không tính); status mặc định ACTIVE
   * - Ghi nhật ký CREATE, before null, after là các field vừa tạo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin khu chuồng
   * @returns A promise resolving to khu chuồng vừa tạo
   * @throws ConflictException Nếu tên khu đã tồn tại
   */
  async create(actor: Actor, body: CreateBarnDto): Promise<BarnResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const saved = await this.saveUnique(() =>
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
          feature: 'F1.6',
        });
        return barn;
      }),
    );
    return toBarnResponse(saved);
  }

  /**
   * Sửa thông tin khu chuồng: tên, mô tả, sức chứa, trạng thái, Head Trainer phụ trách (F1.6)
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) trước khi kiểm luật
   * - Head Trainer mới phải là user HEAD_TRAINER đang ACTIVE; gửi null để gỡ người phụ trách
   * - Khu còn ngựa (horses.barn_id, hồ sơ chưa xóa) thì chặn: chuyển sang CLOSED hoặc MAINTENANCE, gỡ Head Trainer, hạ sức chứa xuống dưới số ô hiện có
   * - Ghi nhật ký UPDATE với before/after của các field thực sự đổi; không field nào đổi thì không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param barnId UUID của khu chuồng
   * @param body Các field cần đổi
   * @returns A promise resolving to khu chuồng sau khi sửa
   * @throws NotFoundException Nếu không có khu hoặc khu đã xóa
   * @throws BadRequestException Nếu Head Trainer mới không phải HEAD_TRAINER đang hoạt động
   * @throws ConflictException Nếu tên khu đã tồn tại, hoặc khu còn ngựa mà thay đổi thuộc trường hợp bị chặn
   */
  async update(
    actor: Actor,
    barnId: string,
    body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);

    const saved = await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const barn = await this.access.lockBarn(manager, barnId);

        if (body.headTrainerId) {
          const isValidTrainer = await manager.exists(UserEntity, {
            where: {
              id: body.headTrainerId,
              role: UserRole.HEAD_TRAINER,
              status: UserStatus.ACTIVE,
            },
          });
          if (!isValidTrainer) {
            throw new BadRequestException(
              'Người phụ trách phải là Head Trainer đang hoạt động',
            );
          }
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
            await this.stableRepository.countStallsInBarn(manager, barnId),
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
          feature: 'F1.6',
        });
        return updated;
      }),
    );
    return toBarnResponse(saved);
  }

  /**
   * Xóa mềm một khu chuồng (F1.6)
   *
   * - Chạy trong transaction, lock khu (pessimistic_write) trước khi kiểm luật
   * - Chặn khi khu còn ngựa (horses.barn_id, hồ sơ chưa xóa) hoặc còn ô chuồng chưa xóa
   * - Ghi nhật ký DELETE với thông tin khu trước khi xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param barnId UUID của khu cần xóa
   * @returns A promise resolving khi đã xóa
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
        feature: 'F1.6',
      });
    });
  }

  /**
   * Lock một khu chuồng và kiểm tra khu đủ điều kiện để Club Manager xếp ngựa vào (F1.2 mục 9, F1.6 mục 2, E1). Dùng cho module horses.
   *
   * - Chạy trong transaction của nơi gọi, không tự mở transaction.
   * - Lock row khu trước rồi mới đếm, để hai request xếp ngựa vào cùng khu phải chạy lần lượt.
   * - Khu phải tồn tại, chưa xóa, đang ACTIVE, đã có Head Trainer phụ trách và còn ít nhất một chỗ nhận ngựa.
   * - Head Trainer phụ trách phải là user chưa xóa, đang ACTIVE và còn vai trò HEAD_TRAINER.
   * - Số chỗ còn nhận = ô trống − ngựa chờ xếp ô trong khu (xem `StableSharedRepository.countStallCapacity`).
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
    const barn = await this.access.lockBarn(manager, barnId);
    if (barn.status !== BarnStatus.ACTIVE) {
      throw new ConflictException('Khu chuồng không ở trạng thái hoạt động');
    }
    if (barn.headTrainerId === null) {
      throw new ConflictException(
        'Khu chuồng chưa có Head Trainer phụ trách, không xếp ngựa vào được',
      );
    }
    const isHeadTrainerActive = await manager.exists(UserEntity, {
      where: {
        id: barn.headTrainerId,
        role: UserRole.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
      },
    });
    if (!isHeadTrainerActive) {
      throw new ConflictException(
        'Khu chưa có Head Trainer đang hoạt động phụ trách',
      );
    }
    const capacity =
      (await this.stableRepository.countStallCapacity(manager, [barnId])).get(
        barnId,
      ) ?? EMPTY_CAPACITY;
    if (remainingStallCount(capacity) < 1) {
      throw new ConflictException(fullBarnMessage(capacity));
    }
    return barn;
  }

  /**
   * Run a write operation and map a unique violation to a barn name conflict
   * @param operation The write operation to run
   * @returns A promise resolving to the operation result
   * @throws ConflictException if the barn name is already used
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException('Tên khu chuồng đã tồn tại');
      }
      throw error;
    }
  }
}
