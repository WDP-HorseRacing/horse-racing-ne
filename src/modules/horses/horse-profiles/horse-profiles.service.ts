import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  IsNull,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { BarnStatus } from '../../stable/constants/barn-status.enum';
import { StallStatus } from '../../stable/constants/stall-status.enum';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
import { StallEntity } from '../../stable/entities/stall.entity';
import {
  assertTrainerBarn,
  isHorseInTrainerBarn,
} from '../../stable/utils/trainer-barn';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import {
  activationError,
  childBirthDateError,
  dateOfBirthError,
  evaluateEligibility,
  evaluateHorsePermissions,
  parentIdError,
  parentProfileError,
  trainerForbiddenFields,
} from '../policies/horse.policy';
import {
  ActivateReferenceHorseDto,
  CreateHorseDto,
  DeleteHorseDto,
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListItemDto,
  HorseListQueryDto,
  HorsePedigreeResponseDto,
  HorsePermissionsResponseDto,
  HorseResponseDto,
  UpdateHorseDto,
} from '../dto/horse.dto';
import { HorseEntity } from '../entities/horse.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import {
  toHorseDetailResponse,
  toHorseListItem,
} from '../mappers/horse-profiles.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type { HorsePersonRow } from '../types/horse.types';
import { clubToday } from '../utils/club-date';
import { HorseProfilesRepository } from './horse-profiles.repository';
import { changedFields, pickFields } from '../utils/record-diff';
import {
  MICROCHIP_TAKEN_MESSAGE,
  PEDIGREE_DEFAULT_DEPTH,
  PEDIGREE_FIELDS,
  PEDIGREE_MAX_DEPTH,
  STALE_HORSE_MESSAGE,
  STALL_OCCUPIED_MESSAGE,
  UNIQUE_CONFLICT_MESSAGES,
} from '../enums/horse.constants';

@Injectable()
export class HorseProfilesService {
  constructor(
    private readonly profiles: HorseProfilesRepository,
    @InjectRepository(HorseEntity)
    private readonly horseRecords: Repository<HorseEntity>,
    @InjectRepository(HorseMeasurementEntity)
    private readonly measurementRecords: Repository<HorseMeasurementEntity>,
    @InjectRepository(HorseOwnershipEntity)
    private readonly ownershipRecords: Repository<HorseOwnershipEntity>,
    @InjectRepository(GroomAssignmentEntity)
    private readonly groomAssignments: Repository<GroomAssignmentEntity>,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly owners: HorseOwnersService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * List horses, limited to the horses the caller can see
   * @param actor The actor resolved from the JWT
   * @param query The query parameters
   * @returns A promise resolving to a paginated list of horses with their current stall and race registration flag
   * @throws ForbiddenException if a caller other than a club manager filters by reference horses or deleted profiles
   */
  async list(
    actor: Actor,
    query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseListItemDto>> {
    const caller = await this.access.currentUser(actor);
    if (query.reference && !this.access.hasRole(actor, UserRole.CLUB_MANAGER)) {
      throw new ForbiddenException('Không có quyền xem ngựa tham chiếu');
    }
    if (query.deleted && !this.access.hasRole(actor, UserRole.CLUB_MANAGER)) {
      throw new ForbiddenException('Không có quyền xem hồ sơ đã xóa');
    }
    const [rows, total] = await this.profiles.list(
      this.access.scopeOf(actor, caller.id),
      query,
    );
    const horseIds = rows.map((horse) => horse.id);
    const [stalls, lockedHorseIds] = await Promise.all([
      this.profiles.currentStallsByHorseIds(horseIds),
      this.profiles.activeTrainingLockHorseIds(horseIds),
    ]);
    const stallByHorseId = new Map(stalls.map((row) => [row.horseId, row]));
    return new PaginationResponseDto(
      rows.map((horse) =>
        toHorseListItem(
          horse,
          stallByHorseId.get(horse.id) ?? null,
          lockedHorseIds.has(horse.id),
        ),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Lấy phần đầu (header) hồ sơ ngựa, bỏ các field mà role của người gọi không được xem.
   *
   * - Groom không nhận sireId, damId.
   * - Veterinarian, Groom không nhận chủ đại diện.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns HorseDetailResponseDto - Hồ sơ kèm ô chuồng, groom, chỉ số mới nhất và (nếu được xem) chủ đại diện
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async get(actor: Actor, id: string): Promise<HorseDetailResponseDto> {
    const horse = await this.access.findReadable(actor, id);
    const seesPedigree = this.access.hasRole(
      actor,
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.HORSE_OWNER,
    );
    const seesOwner = this.access.hasRole(
      actor,
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.HORSE_OWNER,
    );
    const [stalls, groom, representativeOwner, latest, activeTrainingLock] =
      await Promise.all([
        this.profiles.currentStallsByHorseIds([id]),
        this.currentGroom(id),
        seesOwner ? this.representativeOwner(id) : Promise.resolve(null),
        this.measurementRecords
          .createQueryBuilder('m')
          .distinctOn(['m.type'])
          .where('m.horseId = :horseId', { horseId: id })
          .orderBy('m.type', 'ASC')
          .addOrderBy('m.measuredAt', 'DESC')
          .getMany(),
        this.horses.hasActiveTrainingLock(id),
      ]);
    return toHorseDetailResponse(
      horse,
      {
        stall: stalls[0] ?? null,
        groom,
        representativeOwner,
        latestMeasurements: latest,
        activeTrainingLock,
      },
      { includeParents: seesPedigree, includeRepresentativeOwner: seesOwner },
    );
  }

  /**
   * Create a horse, optionally placing it in a stall and assigning its owners in the same transaction
   * @param actor The actor resolved from the JWT
   * @param body The horse data to create
   * @returns A promise resolving to the created horse
   * @throws BadRequestException if the date of birth is in the future, the parents, the avatar media, the stall or the owners are invalid, or a reference horse is given a stall or owners
   * @throws ConflictException if the microchip ID is already used, or the stall is not AVAILABLE, not in an ACTIVE barn or already has a horse
   */
  async create(actor: Actor, body: CreateHorseDto): Promise<HorseResponseDto> {
    await this.access.currentUser(actor);
    const isReference = body.isReference ?? false;
    if (isReference && (body.stallId || body.owners)) {
      throw new BadRequestException(
        'Ngựa tham chiếu không được xếp chuồng hay gán chủ sở hữu',
      );
    }
    this.assertDateOfBirth(body.dateOfBirth);
    const microchipId = body.microchipId?.trim() || null;
    await this.assertMicrochipFree(microchipId);
    const sireId = body.sireId ?? null;
    const damId = body.damId ?? null;
    await this.validateMedia(body.mediaId);
    if (body.owners) await this.owners.validateOwners(body.owners);

    const horse = await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        if (sireId || damId) {
          await this.profiles.lockPedigree(manager);
          await this.validateParents(
            manager,
            { dateOfBirth: body.dateOfBirth },
            sireId,
            damId,
          );
        }
        // lock empty stall
        const stall = body.stallId
          ? await this.lockEmptyStall(manager, body.stallId)
          : null;
        const created = await manager.save(HorseEntity, {
          name: body.name.trim(),
          gender: body.gender,
          breed: body.breed ?? null,
          color: body.color ?? null,
          raceAptitude: body.raceAptitude ?? null,
          microchipId,
          dateOfBirth: body.dateOfBirth ?? null,
          mediaId: body.mediaId ?? null,
          sireId,
          damId,
          isReference,
        });
        if (stall) {
          await this.assignStall(manager, stall, created.id, new Date());
        }
        if (body.owners) {
          await this.owners.insertOwnerships(
            manager,
            created.id,
            body.owners,
            new Date(),
          );
        }
        return created;
      }),
    );
    return toHorseResponse(horse);
  }

  /**
   * Update a horse's profile
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param body The fields to update
   * @returns A promise resolving to the updated horse
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the date of birth is in the future or not before the earliest child of the horse, or the parents or the avatar media are invalid
   * @throws ConflictException if the horse is transferred, the gender change breaks the pedigree, the pedigree forms a cycle or the microchip ID is already used
   * @throws ConflictException if the version is stale because someone else saved the horse first
   * Writes an audit log with the before and after values of the changed fields in the same transaction.
   * @throws ForbiddenException if a head trainer edits a horse outside their barn or sends fields other than raceAptitude
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findHorse(id);
    this.access.assertNotTransferred(horse);
    const { version, ...fields } = body;
    await this.assertEditableFields(actor, caller.id, horse.id, fields);
    this.assertCurrentVersion(horse, version);
    this.assertDateOfBirth(fields.dateOfBirth);
    if (fields.microchipId !== undefined) {
      await this.assertMicrochipFree(fields.microchipId?.trim() || null, id);
    }
    if (fields.mediaId !== undefined) {
      await this.validateMedia(fields.mediaId);
    }

    const changes = changedFields<HorseEntity>(horse, {
      ...fields,
      name: fields.name?.trim(),
      microchipId:
        fields.microchipId === undefined
          ? undefined
          : fields.microchipId?.trim() || null,
    });
    if (Object.keys(changes).length === 0) return toHorseResponse(horse);

    await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        if (PEDIGREE_FIELDS.some((field) => field in changes)) {
          await this.profiles.lockPedigree(manager);
          await this.assertPedigreeChange(manager, horse, changes);
        }
        const result = await manager
          .getRepository(HorseEntity)
          .update({ id, version }, changes);
        if (!result.affected) {
          throw new ConflictException(STALE_HORSE_MESSAGE);
        }
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.HORSE,
          entityId: id,
          before: pickFields(horse, Object.keys(changes)),
          after: changes,
        });
      }),
    );
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Xóa mềm hồ sơ ngựa tạo nhầm. Chỉ xóa được khi ngựa chưa từng phát sinh dữ liệu nghiệp vụ.
   *
   * - Khóa phả hệ và row ngựa trước rồi mới kiểm tra, tránh vừa kiểm tra xong thì có dữ liệu mới
   * - Ngựa đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ của ngựa khác thì phải đổi vòng đời thay vì xóa
   * - Lưu lý do xóa và ghi nhật ký audit; dữ liệu lịch sử không bị xóa theo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Lý do xóa
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws ConflictException Nếu ngựa đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ trong phả hệ
   */
  async remove(actor: Actor, id: string, body: DeleteHorseDto): Promise<void> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      await this.profiles.lockPedigree(manager);
      const horse = await this.horses.lockHorse(manager, id);
      if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
      if (await this.profiles.hasBusinessData(id, manager)) {
        throw new ConflictException(
          'Ngựa đã phát sinh dữ liệu nghiệp vụ, hãy đổi trạng thái vòng đời thay vì xóa',
        );
      }
      const usage = await this.parentUsage(manager, id);
      if (usage.asSire || usage.asDam) {
        throw new ConflictException(
          'Ngựa đang là cha/mẹ trong phả hệ của ngựa khác, không thể xóa',
        );
      }
      const horses = manager.getRepository(HorseEntity);
      await horses.update({ id }, { deletedReason: body.reason });
      await horses.softDelete({ id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE,
        entityId: id,
        before: {
          name: horse.name,
          microchipId: horse.microchipId,
          lifecycleStatus: horse.lifecycleStatus,
        },
        after: { deletedReason: body.reason },
      });
    });
  }

  /**
   * Kích hoạt ngựa tham chiếu thành ngựa của câu lạc bộ khi CLB mua lại. Chỉ đi một chiều.
   *
   * - Chuyển isReference sang false, đưa vòng đời về ACTIVE và sức khỏe về ELIGIBLE
   * - Có stallId thì xếp chuồng, có owners thì gán chủ, tất cả trong cùng một transaction
   * - Ghi nhật ký audit với giá trị trước và sau của các field đổi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa tham chiếu
   * @param body version lấy từ lần GET gần nhất, kèm ô chuồng và chủ sở hữu nếu có
   * @returns Promise trả về hồ sơ ngựa sau khi kích hoạt
   * @throws NotFoundException Nếu không có ngựa
   * @throws BadRequestException Nếu ô chuồng không tồn tại, hoặc danh sách chủ sở hữu không hợp lệ
   * @throws ConflictException Nếu ngựa không phải ngựa tham chiếu, version đã cũ, hoặc ô chuồng không dùng được
   */
  async activate(
    actor: Actor,
    id: string,
    body: ActivateReferenceHorseDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findHorse(id);
    const activationFailure = activationError(horse.isReference);
    if (activationFailure) throw new ConflictException(activationFailure);
    this.assertCurrentVersion(horse, body.version);
    if (body.owners) await this.owners.validateOwners(body.owners);

    const changes = {
      isReference: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus: HorseHealthStatus.ELIGIBLE,
    };
    await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(HorseEntity)
          .update({ id, version: body.version }, changes);
        if (!result.affected) {
          throw new ConflictException(STALE_HORSE_MESSAGE);
        }
        if (body.stallId) {
          const stall = await this.lockEmptyStall(manager, body.stallId);
          await this.assignStall(manager, stall, id, new Date());
        }
        if (body.owners) {
          await this.owners.insertOwnerships(
            manager,
            id,
            body.owners,
            new Date(),
          );
        }
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.HORSE,
          entityId: id,
          before: pickFields(horse, Object.keys(changes)),
          after: changes,
        });
      }),
    );
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Get the ancestors of a horse visible to the caller up to the requested depth
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param depthInput The raw depth query value, defaulting to PEDIGREE_DEFAULT_DEPTH
   * @returns A promise resolving to the pedigree of the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   * @throws BadRequestException if the depth is not an integer between 1 and PEDIGREE_MAX_DEPTH
   */
  async getPedigree(
    actor: Actor,
    id: string,
    depthInput?: string,
  ): Promise<HorsePedigreeResponseDto> {
    const horse = await this.access.findReadable(actor, id);
    const depth = this.parsePedigreeDepth(depthInput);
    const ancestors = await this.profiles.findPedigreeAncestors(id, depth);
    return { horseId: horse.id, horseName: horse.name, depth, ancestors };
  }

  /**
   * Evaluate whether a horse visible to the caller is eligible for training and racing
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @returns A promise resolving to the eligibility result and its reasons
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async getEligibility(
    actor: Actor,
    horseId: string,
  ): Promise<HorseEligibilityResponseDto> {
    const horse = await this.access.findReadable(actor, horseId);
    const activeTrainingLock = await this.horses.hasActiveTrainingLock(horseId);
    const result = evaluateEligibility({
      isReference: horse.isReference,
      lifecycleStatus: horse.lifecycleStatus,
      healthStatus: horse.healthStatus,
      hasActiveTrainingLock: activeTrainingLock,
    });
    return {
      horseId: horse.id,
      healthStatus: horse.healthStatus,
      lifecycleStatus: horse.lifecycleStatus,
      activeTrainingLock,
      ...result,
    };
  }

  /**
   * Tính người gọi được làm gì trên hồ sơ ngựa để FE ẩn/hiện nút và tab.
   * Các API ghi vẫn tự kiểm tra quyền, không dựa vào kết quả này.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns HorsePermissionsResponseDto - Các cờ quyền của người gọi
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getPermissions(
    actor: Actor,
    horseId: string,
  ): Promise<HorsePermissionsResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findReadable(actor, horseId);
    const [isInTrainerBarn, isAssignedGroom] = await Promise.all([
      this.access.hasRole(actor, UserRole.HEAD_TRAINER)
        ? isHorseInTrainerBarn(this.dataSource.manager, horseId, caller.id)
        : Promise.resolve(false),
      this.access.hasRole(actor, UserRole.GROOM)
        ? this.horses.isGroomAssigned(horseId, caller.id)
        : Promise.resolve(false),
    ]);
    return {
      horseId: horse.id,
      ...evaluateHorsePermissions({
        roles: actor.roles,
        isReference: horse.isReference,
        isDeleted: horse.deletedAt !== null,
        lifecycleStatus: horse.lifecycleStatus,
        isInTrainerBarn,
        isAssignedGroom,
      }),
    };
  }

  /**
   * Kiểm tra Groom chỉ ghi dữ liệu lên ngựa được giao cho mình.
   * Người vừa là Groom vừa là Head Trainer hoặc Veterinarian thì không bị chặn ở đây.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @throws ForbiddenException Nếu người gọi là Groom mà không được giao con ngựa này
   */
  private async assertGroomAssigned(
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<void> {
    if (
      !this.access.hasRole(actor, UserRole.GROOM) ||
      this.access.hasRole(actor, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
    ) {
      return;
    }
    if (!(await this.horses.isGroomAssigned(horseId, callerId))) {
      throw new ForbiddenException('Ngựa không được giao cho bạn');
    }
  }

  /**
   * Kiểm tra người gọi được sửa những field đã gửi lên:
   * - Club Manager: sửa toàn bộ
   * - Head Trainer: chỉ sửa raceAptitude, và chỉ với ngựa ở khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @param fields Các field hồ sơ người gọi gửi lên, không gồm version
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu Head Trainer sửa ngựa ngoài khu, hoặc gửi field ngoài raceAptitude
   */
  private async assertEditableFields(
    actor: Actor,
    callerId: string,
    horseId: string,
    fields: object,
  ): Promise<void> {
    if (this.access.hasRole(actor, UserRole.CLUB_MANAGER)) return;
    await assertTrainerBarn(this.dataSource.manager, actor, callerId, horseId);
    const forbidden = trainerForbiddenFields(fields);
    if (forbidden.length > 0) {
      throw new ForbiddenException(
        `Huấn luyện viên trưởng chỉ được sửa sở trường cự ly, không được sửa: ${forbidden.join(', ')}`,
      );
    }
  }

  /**
   * Kiểm tra người gọi đang sửa đúng bản mới nhất của hồ sơ ngựa (optimistic lock).
   *
   * @param horse Hồ sơ ngựa đang lưu trong DB
   * @param version version người gọi nhận được từ lần GET trước khi sửa
   * @throws ConflictException Nếu người khác đã lưu hồ sơ sau lúc người gọi tải về
   */
  private assertCurrentVersion(horse: HorseEntity, version: number): void {
    if (horse.version !== version) {
      throw new ConflictException(STALE_HORSE_MESSAGE);
    }
  }

  /**
   * Ensure a date of birth is not in the future
   * @param dateOfBirth The date of birth, or null or undefined if not set
   * @throws BadRequestException if the date of birth is after today
   */
  private assertDateOfBirth(dateOfBirth: string | null | undefined): void {
    const error = dateOfBirthError(dateOfBirth, clubToday());
    if (error) throw new BadRequestException(error);
  }

  /**
   * Ensure a microchip ID is not used by any other horse, including soft-deleted and transferred horses
   * @param microchipId The trimmed microchip ID, or null if not set
   * @param excludeHorseId The ID of the horse being updated, omitted when creating
   * @returns A promise resolving once the check passes
   * @throws ConflictException if another horse already uses the microchip ID
   */
  private async assertMicrochipFree(
    microchipId: string | null,
    excludeHorseId?: string,
  ): Promise<void> {
    if (
      microchipId &&
      (await this.horseRecords.exists({
        where: excludeHorseId
          ? { microchipId, id: Not(excludeHorseId) }
          : { microchipId },
        withDeleted: true,
      }))
    ) {
      throw new ConflictException(MICROCHIP_TAKEN_MESSAGE);
    }
  }

  /**
   * Lock a stall and ensure it is available in an active barn with no horse in it
   * @param manager The transaction entity manager
   * @param stallId The ID of the stall
   * @returns A promise resolving to the locked stall
   * @throws BadRequestException if the stall does not exist
   * @throws ConflictException if the stall is not AVAILABLE, its barn is not ACTIVE, or it already has a horse
   */
  private async lockEmptyStall(
    manager: EntityManager,
    stallId: string,
  ): Promise<StallEntity> {
    const stall = await manager.getRepository(StallEntity).findOne({
      where: { id: stallId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stall) throw new BadRequestException('Ô chuồng không tồn tại');
    if (stall.status !== StallStatus.AVAILABLE) {
      throw new ConflictException('Ô chuồng không ở trạng thái khả dụng');
    }
    const barnIsActive = await manager
      .getRepository(BarnEntity)
      .existsBy({ id: stall.barnId, status: BarnStatus.ACTIVE });
    if (!barnIsActive) {
      throw new ConflictException('Khu chuồng không ở trạng thái hoạt động');
    }
    const hasActiveAssignment = await manager
      .getRepository(StallAssignmentEntity)
      .existsBy({ stallId, endAt: IsNull() });
    if (hasActiveAssignment) {
      throw new ConflictException(STALL_OCCUPIED_MESSAGE);
    }
    return stall;
  }

  /**
   * Ghi phân công chuồng và cập nhật trạng thái ô chuồng trong cùng transaction.
   */
  private async assignStall(
    manager: EntityManager,
    stall: StallEntity,
    horseId: string,
    startAt: Date,
  ): Promise<void> {
    await manager.save(StallAssignmentEntity, {
      stallId: stall.id,
      horseId,
      startAt,
      endAt: null,
    });
    await manager
      .getRepository(StallEntity)
      .update({ id: stall.id }, { status: StallStatus.OCCUPIED });
  }

  /** Lấy groom hiện được phân công cho ngựa, hoặc null nếu chưa có. */
  private async currentGroom(horseId: string): Promise<HorsePersonRow | null> {
    const assignment = await this.groomAssignments.findOne({
      where: { horseId, endAt: IsNull() },
      relations: { groom: true },
    });
    return assignment
      ? { id: assignment.groom.id, fullName: assignment.groom.fullName }
      : null;
  }

  /** Lấy chủ đại diện trong các dòng sở hữu đang mở. */
  private async representativeOwner(
    horseId: string,
  ): Promise<HorsePersonRow | null> {
    const ownership = await this.ownershipRecords.findOne({
      where: { horseId, endAt: IsNull(), isRepresentative: true },
      relations: { owner: true },
    });
    return ownership
      ? { id: ownership.owner.id, fullName: ownership.owner.fullName }
      : null;
  }

  /**
   * Validate the sire and dam of a horse against their profiles and the existing pedigree
   * @param manager The transaction entity manager holding the pedigree lock
   * @param child The ID and date of birth of the horse, without an ID when creating
   * @param sireId The ID of the sire
   * @param damId The ID of the dam
   * @returns A promise resolving once the check passes
   * @throws BadRequestException if a parent is the horse itself, the parents are the same, a parent does not exist, or a parent has the wrong gender or a later date of birth
   * @throws ConflictException if a parent would create a cycle in the pedigree
   */
  private async validateParents(
    manager: EntityManager,
    child: { id?: string; dateOfBirth?: string | null },
    sireId: string | null,
    damId: string | null,
  ): Promise<void> {
    // Đảm bảo cha/mẹ không trùng nhau và không phải là chính ngựa đó
    const idError = parentIdError(child.id, sireId, damId);
    if (idError) throw new BadRequestException(idError);

    const sire = sireId ? await this.findParent(manager, sireId, 'Sire') : null;
    const dam = damId ? await this.findParent(manager, damId, 'Dam') : null;

    // Check giới tính và ngày sinh của cha/mẹ
    const profileError = parentProfileError(child, sire, dam);
    if (profileError) throw new BadRequestException(profileError);

    const childId = child.id;
    if (!childId) return;
    for (const parent of [sire, dam]) {
      if (
        parent &&
        (await this.profiles.wouldCreateCycle(childId, parent.id, manager))
      ) {
        throw new ConflictException('Quan hệ cha/mẹ tạo thành vòng lặp phả hệ');
      }
    }
  }

  /** Kiểm tra ngựa hiện được tham chiếu làm sire hoặc dam trong transaction. */
  private async parentUsage(
    manager: EntityManager,
    horseId: string,
  ): Promise<{ asSire: boolean; asDam: boolean }> {
    const horses = manager.getRepository(HorseEntity);
    const [asSire, asDam] = await Promise.all([
      horses.existsBy({ sireId: horseId }),
      horses.existsBy({ damId: horseId }),
    ]);
    return { asSire, asDam };
  }

  /**
   * Find a parent horse
   * @param manager The transaction entity manager holding the pedigree lock
   * @param id The ID of the parent horse
   * @param label The parent label used in the error message
   * @returns A promise resolving to the parent horse
   * @throws BadRequestException if the parent does not exist
   */
  private async findParent(
    manager: EntityManager,
    id: string,
    label: string,
  ): Promise<HorseEntity> {
    const parent = await this.horses.findById(id, manager);
    if (!parent) {
      throw new BadRequestException(`${label} không tồn tại`);
    }
    return parent;
  }

  /**
   * Kiểm tra thay đổi phả hệ của một con ngựa khi đang giữ khoá phả hệ:
   * - Đổi giới tính: không làm sai vai trò sire/dam của ngựa khác
   * - Đổi cha/mẹ hoặc ngày sinh: cha/mẹ hợp lệ, không tạo vòng lặp phả hệ
   * - Đổi ngày sinh: vẫn sinh trước ngựa con sớm nhất
   *
   * @param manager EntityManager của transaction đang giữ khoá phả hệ
   * @param horse Hồ sơ ngựa trước khi sửa
   * @param changes Các field thực sự đổi
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws BadRequestException Nếu cha/mẹ không hợp lệ hoặc ngày sinh không trước ngựa con sớm nhất
   * @throws ConflictException Nếu đổi giới tính làm sai phả hệ, hoặc cha/mẹ tạo vòng lặp phả hệ
   */
  private async assertPedigreeChange(
    manager: EntityManager,
    horse: HorseEntity,
    changes: Partial<HorseEntity>,
  ): Promise<void> {
    if (changes.gender) {
      await this.assertGenderChangeKeepsPedigree(
        manager,
        horse.id,
        changes.gender,
      );
    }
    if ('sireId' in changes || 'damId' in changes || 'dateOfBirth' in changes) {
      await this.validateParents(
        manager,
        {
          id: horse.id,
          dateOfBirth:
            changes.dateOfBirth === undefined
              ? horse.dateOfBirth
              : changes.dateOfBirth,
        },
        changes.sireId === undefined ? horse.sireId : changes.sireId,
        changes.damId === undefined ? horse.damId : changes.damId,
      );
    }
    if (changes.dateOfBirth) {
      const child = await manager.getRepository(HorseEntity).findOne({
        select: { id: true, dateOfBirth: true },
        where: [
          { sireId: horse.id, dateOfBirth: Not(IsNull()) },
          { damId: horse.id, dateOfBirth: Not(IsNull()) },
        ],
        order: { dateOfBirth: 'ASC' },
      });
      const childError = childBirthDateError(
        changes.dateOfBirth,
        child?.dateOfBirth ?? null,
      );
      if (childError) throw new BadRequestException(childError);
    }
  }

  /**
   * Ensure a gender change keeps the horse valid as a sire or dam of other horses
   * @param manager The transaction entity manager holding the pedigree lock
   * @param horseId The ID of the horse
   * @param gender The new gender
   * @returns A promise resolving once the check passes
   * @throws ConflictException if the horse is a sire changing to FEMALE or a dam changing away from FEMALE
   */
  private async assertGenderChangeKeepsPedigree(
    manager: EntityManager,
    horseId: string,
    gender: HorseGender,
  ): Promise<void> {
    const usage = await this.parentUsage(manager, horseId);
    if (usage.asSire && gender === HorseGender.FEMALE) {
      throw new ConflictException(
        'Ngựa đang là sire của ngựa khác, không thể đổi thành FEMALE',
      );
    }
    if (usage.asDam && gender !== HorseGender.FEMALE) {
      throw new ConflictException(
        'Ngựa đang là dam của ngựa khác, phải giữ giới tính FEMALE',
      );
    }
  }

  /**
   * Ensure the avatar media is an image
   * @param mediaId The ID of the media asset
   * @returns A promise resolving once the check passes
   * @throws BadRequestException if the media is not found or is not an image
   */
  private async validateMedia(
    mediaId: string | null | undefined,
  ): Promise<void> {
    if (!mediaId) return;
    const media = await this.dataSource
      .getRepository(MediaAssetEntity)
      .findOneBy({ id: mediaId });
    if (!media || !media.mimeType.startsWith('image/')) {
      throw new BadRequestException('Ảnh đại diện phải là file ảnh');
    }
  }

  /**
   * Parse the pedigree depth query value
   * @param depthInput The raw depth query value
   * @returns The depth, or PEDIGREE_DEFAULT_DEPTH when omitted
   * @throws BadRequestException if the depth is not an integer between 1 and PEDIGREE_MAX_DEPTH
   */
  private parsePedigreeDepth(depthInput?: string): number {
    if (depthInput === undefined || depthInput === '') {
      return PEDIGREE_DEFAULT_DEPTH;
    }
    const depth = Number(depthInput);
    if (!Number.isInteger(depth) || depth < 1 || depth > PEDIGREE_MAX_DEPTH) {
      throw new BadRequestException(
        `Depth phải từ 1 đến ${PEDIGREE_MAX_DEPTH}`,
      );
    }
    return depth;
  }

  /**
   * Run a write operation and map a unique violation raised by a concurrent write to a conflict
   * @param operation The write operation to run
   * @returns A promise resolving to the operation result
   * @throws ConflictException if the microchip ID is already used or the stall was just taken by another horse
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const driverError = (
        error instanceof QueryFailedError ? error.driverError : undefined
      ) as { code?: string; constraint?: string } | undefined;
      if (driverError?.code === '23505') {
        const message = UNIQUE_CONFLICT_MESSAGES[driverError.constraint ?? ''];
        if (message) throw new ConflictException(message);
      }
      throw error;
    }
  }
}
