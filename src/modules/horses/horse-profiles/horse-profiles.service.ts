import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { MediaService } from '../../media/services/media.service';
import { BarnsService } from '../../stable/barns/barns.service';
import {
  CREATE_AUDIT_FIELDS,
  HORSE_BARN_ASSIGNED_EVENT,
  MICROCHIP_TAKEN_MESSAGE,
  PEDIGREE_DEPTH,
  PEDIGREE_FIELDS,
  STALE_HORSE_MESSAGE,
  UNIQUE_CONFLICT_MESSAGES,
} from '../constants/horse.constants';
import {
  CreateHorseDto,
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListItemDto,
  HorseListQueryDto,
  HorsePedigreeResponseDto,
  HorsePermissionsResponseDto,
  HorsePhotoUrlResponseDto,
  HorseResponseDto,
  UpdateHorseDto,
} from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import {
  toHorseDetailResponse,
  toHorseEligibilityResponse,
  toHorseListItem,
  toHorsePedigreeResponse,
  toHorsePermissionsResponse,
  toHorsePhotoUrlResponse,
  toPedigreeNode,
} from '../mappers/horse-profiles.mapper';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  assertDateOfBirth,
  evaluateEligibility,
  evaluateHorsePermissions,
  managerForbiddenFields,
  trainerForbiddenFields,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsePedigreeService } from '../shared/horse-pedigree.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type {
  HorseBarnAssignedEvent,
  HorseLocationRow,
} from '../types/horse.types';
import { clubToday } from '../utils/club-date';
import { changedFields, pickFields } from '../utils/record-diff';
import { HorseProfilesRepository } from './horse-profiles.repository';

@Injectable()
export class HorseProfilesService {
  constructor(
    private readonly profiles: HorseProfilesRepository,
    @InjectRepository(HorseEntity)
    private readonly horseRecords: Repository<HorseEntity>,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly pedigree: HorsePedigreeService,
    private readonly media: MediaService,
    private readonly barns: BarnsService,
    private readonly events: DomainEventPublisher,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Lấy một trang danh sách ngựa trong phạm vi người gọi (F1.1).
   *
   * - Club Manager, Head Trainer, Veterinarian, Groom: toàn câu lạc bộ. Horse Owner: ngựa mình sở hữu
   * - Chỉ Club Manager bật được includeDeleted; hồ sơ đã xóa trả kèm isDeleted = true
   * - Horse Owner không nhận id khu và ô, chỉ nhận tên khu và mã ô
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Từ khóa, bộ lọc, sắp xếp và phân trang
   * @returns Promise trả về một trang danh sách ngựa kèm vị trí, cờ được đua và cờ đã xóa
   * @throws ForbiddenException Nếu người gọi không phải Club Manager mà bật includeDeleted
   */
  async list(
    actor: Actor,
    query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseListItemDto>> {
    const caller = await this.access.currentUser(actor);
    if (
      query.includeDeleted &&
      !this.access.hasRole(actor, UserRole.CLUB_MANAGER)
    ) {
      throw new ForbiddenException('Không có quyền xem hồ sơ đã xóa');
    }
    const scope = this.access.scopeOf(actor, caller.id);
    const [rows, total] = await this.profiles.list(scope, caller.id, query);
    const horseIds = rows.map((horse) => horse.id);
    const [locations, lockedHorseIds] = await Promise.all([
      this.profiles.locationsByHorseIds(horseIds),
      this.horses.activeTrainingLockHorseIds(horseIds),
    ]);
    const locationByHorseId = new Map(
      locations.map((row) => [row.horseId, row]),
    );
    return new PaginationResponseDto(
      rows.map((horse) =>
        toHorseListItem(
          horse,
          locationByHorseId.get(horse.id) ?? emptyLocation(horse.id),
          lockedHorseIds.has(horse.id),
          scope.kind === 'OWNER',
        ),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Lấy danh sách ngựa người gọi đang là chủ sở hữu, kể cả ngựa đã chuyển nhượng (hồ sơ chỉ đọc).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về các hồ sơ ngựa của người gọi, sắp theo tên
   */
  async listMyHorses(actor: Actor): Promise<HorseResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    const horses = await this.horseRecords.find({
      where: { ownerId: caller.id },
      order: { name: 'ASC' },
    });
    return horses.map(toHorseResponse);
  }

  /**
   * Lấy tab thông tin hồ sơ ngựa (F1.3, nhóm 1): định danh, trạng thái, được tập/được đua, vị trí, groom, chủ và chỉ số mới nhất.
   *
   * - Mọi vai trò trong phạm vi xem đều nhận cùng nhóm thông tin này
   * - Horse Owner không nhận id khu và ô
   * - Club Manager mở được hồ sơ đã xóa (isDeleted = true); vai trò khác nhận 404
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns HorseDetailResponseDto - Hồ sơ chi tiết của ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async get(actor: Actor, id: string): Promise<HorseDetailResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findReadable(actor, id);
    const [locations, groom, owner, latestMeasurements, activeTrainingLock] =
      await Promise.all([
        this.profiles.locationsByHorseIds([id]),
        this.profiles.currentGroom(id),
        this.profiles.ownerOf(horse.ownerId),
        this.horses.latestMeasurements(id),
        this.horses.hasActiveTrainingLock(id),
      ]);
    return toHorseDetailResponse(
      horse,
      {
        location: locations[0] ?? emptyLocation(id),
        groom,
        owner,
        latestMeasurements,
        activeTrainingLock,
      },
      this.access.scopeOf(actor, caller.id).kind === 'OWNER',
    );
  }

  /**
   * Cấp link tải ảnh đại diện của ngựa cho người xem được hồ sơ (F1.3)
   *
   * - Quyền xem theo findReadable: ai xem được hồ sơ thì xem được ảnh; module media chỉ ký link, không tự quyết quyền
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns A promise resolving to presigned GET URL có hạn dùng
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa, ngựa nằm ngoài phạm vi của người gọi, hoặc ngựa chưa có ảnh
   */
  async getPhotoUrl(
    actor: Actor,
    id: string,
  ): Promise<HorsePhotoUrlResponseDto> {
    const horse = await this.access.findReadable(actor, id);
    if (!horse.mediaId) {
      throw new NotFoundException('Ngựa chưa có ảnh đại diện');
    }
    return toHorsePhotoUrlResponse(
      await this.media.signDownloadUrl(horse.mediaId),
    );
  }

  /**
   * Tạo hồ sơ ngựa mới (F1.2). Sức khỏe luôn ELIGIBLE, vòng đời luôn ACTIVE.
   *
   * - Chủ sở hữu (nếu có) phải là tài khoản HORSE_OWNER đang hoạt động
   * - Ảnh (nếu có) phải là ảnh ngựa người gọi đã tải lên: JPEG/PNG/WebP, tối đa 10 MB
   * - Cha mẹ phải là ngựa có hồ sơ tại câu lạc bộ, đúng giới tính, sinh trước con
   * - Khu (nếu có) phải đang hoạt động, có Head Trainer và còn ô trống; không chọn thì ngựa vào "Chờ xếp khu"
   * - Kiểm ảnh trên storage trước khi mở transaction (có gọi mạng tới storage)
   * - Tạo hồ sơ, xếp khu và ghi nhật ký trong cùng một transaction; sau khi commit phát HORSE_BARN_ASSIGNED_EVENT để báo Head Trainer khu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Thông tin hồ sơ ngựa
   * @returns Promise trả về hồ sơ vừa tạo
   * @throws BadRequestException Nếu ngày sinh ở tương lai, cha mẹ, chủ sở hữu hoặc ảnh không hợp lệ
   * @throws NotFoundException Nếu không tìm thấy tệp ảnh của người gọi
   * @throws ConflictException Nếu số chip đã được dùng (kể cả hồ sơ đã xóa), ảnh chưa được tải lên xong, hoặc khu không xếp được
   */
  async create(actor: Actor, body: CreateHorseDto): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    assertDateOfBirth(body.dateOfBirth, clubToday());
    const microchipId = body.microchipId?.trim() || null;
    await this.assertMicrochipFree(microchipId);
    const sireId = body.sireId ?? null;
    const damId = body.damId ?? null;
    const ownerId = body.ownerId ?? null;
    if (body.mediaId) {
      await this.media.assertAttachableHorsePhoto(caller.id, body.mediaId);
    }

    const horse = await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        await this.assertActiveOwner(manager, ownerId);
        if (sireId || damId) {
          await this.pedigree.lockPedigree(manager);
          await this.pedigree.validateParents(
            manager,
            { dateOfBirth: body.dateOfBirth },
            sireId,
            damId,
          );
        }
        if (body.barnId) {
          await this.barns.lockAssignableBarn(manager, body.barnId);
        }
        const created = await manager.save(HorseEntity, {
          name: body.name.trim(),
          gender: body.gender,
          breed: body.breed ?? null,
          color: body.color ?? null,
          microchipId,
          dateOfBirth: body.dateOfBirth ?? null,
          mediaId: body.mediaId ?? null,
          sireId,
          damId,
          ownerId,
          barnId: body.barnId ?? null,
        });
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.HORSE,
          entityId: created.id,
          before: null,
          after: pickFields(created, CREATE_AUDIT_FIELDS),
          feature: 'F1.2',
        });
        return created;
      }),
    );
    if (horse.barnId) {
      const event: HorseBarnAssignedEvent = {
        eventId: randomUUID(),
        horseId: horse.id,
        barnId: horse.barnId,
      };
      this.events.publish(HORSE_BARN_ASSIGNED_EVENT, event);
    }
    return toHorseResponse(horse);
  }

  /**
   * Cập nhật hồ sơ ngựa (F1.4).
   *
   * - Club Manager: định danh, ảnh, cha mẹ, chủ sở hữu; không sửa sở trường cự ly (BA chốt Q-5)
   * - Head Trainer: chỉ sở trường cự ly, chỉ ngựa thuộc khu mình phụ trách
   * - Gửi field ngoài quyền thì trả 403, không âm thầm bỏ qua
   * - Bắt buộc gửi version lấy từ lần GET gần nhất; người khác đã lưu trước thì trả 409 để giao diện tải lại bản mới nhất
   * - Đổi chủ: chủ cũ mất quyền xem ngay khi lưu, chủ mới thấy toàn bộ lịch sử; nhật ký ghi từ ai sang ai
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @param body Các field cần sửa kèm version
   * @returns Promise trả về hồ sơ sau khi sửa
   * @throws NotFoundException Nếu không có ngựa (Head Trainer: kể cả hồ sơ đã xóa) hoặc không tìm thấy tệp ảnh của người gọi
   * @throws ForbiddenException Nếu Club Manager sửa hồ sơ đã xóa, người gọi gửi field ngoài quyền, hoặc Head Trainer sửa ngựa ngoài khu
   * @throws BadRequestException Nếu ngày sinh, cha mẹ, chủ sở hữu hoặc ảnh không hợp lệ
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, version đã cũ, số chip đã dùng, đổi giới tính làm sai phả hệ hoặc tạo vòng lặp phả hệ
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findWritableHorse(actor, id);
    this.access.assertNotTransferred(horse);
    const { version, ...fields } = body;
    await this.assertEditableFields(actor, caller.id, horse.id, fields);
    this.assertCurrentVersion(horse, version);
    assertDateOfBirth(fields.dateOfBirth, clubToday());
    if (fields.microchipId !== undefined) {
      await this.assertMicrochipFree(fields.microchipId?.trim() || null, id);
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
    if (changes.mediaId) {
      await this.media.assertAttachableHorsePhoto(caller.id, changes.mediaId);
    }

    await this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        if (changes.ownerId !== undefined) {
          await this.assertActiveOwner(manager, changes.ownerId);
        }
        if (PEDIGREE_FIELDS.some((field) => field in changes)) {
          await this.pedigree.lockPedigree(manager);
          await this.pedigree.assertPedigreeChange(manager, horse, changes);
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
          feature: 'F1.4',
        });
      }),
    );
    return toHorseResponse(await this.access.findHorse(id));
  }

  /**
   * Lấy cây phả hệ 3 đời của ngựa (F1.3): con ngựa đang xem, cha mẹ, ông bà.
   *
   * - Chỉ vẽ từ ngựa có hồ sơ tại câu lạc bộ, tổ tiên đã bị xóa hồ sơ thì bỏ trống
   * - Horse Owner chỉ mở được tổ tiên mình sở hữu, tổ tiên khác chỉ hiện tên (canOpen = false)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của ngựa
   * @returns Promise trả về cây phả hệ của ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getPedigree(
    actor: Actor,
    id: string,
  ): Promise<HorsePedigreeResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findReadable(actor, id);
    const ownerOnly = this.access.scopeOf(actor, caller.id).kind === 'OWNER';
    const ancestors = await this.profiles.findPedigreeAncestors(
      id,
      PEDIGREE_DEPTH,
    );
    return toHorsePedigreeResponse(
      horse,
      PEDIGREE_DEPTH,
      ancestors.map((row) =>
        toPedigreeNode(row, !ownerOnly || row.ownerId === caller.id),
      ),
    );
  }

  /**
   * Tính "được tập" và "được đua" của ngựa kèm lý do (mục III.4).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về hai cờ, trạng thái hiện tại và lý do chặn
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getEligibility(
    actor: Actor,
    horseId: string,
  ): Promise<HorseEligibilityResponseDto> {
    const horse = await this.access.findReadable(actor, horseId);
    const activeTrainingLock = await this.horses.hasActiveTrainingLock(horseId);
    return toHorseEligibilityResponse(
      horse,
      activeTrainingLock,
      evaluateEligibility({
        isDeleted: horse.deletedAt !== null,
        lifecycleStatus: horse.lifecycleStatus,
        healthStatus: horse.healthStatus,
        hasActiveTrainingLock: activeTrainingLock,
      }),
    );
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
        ? this.access.isHorseInTrainerBarn(
            this.dataSource.manager,
            horseId,
            caller.id,
          )
        : Promise.resolve(false),
      this.access.hasRole(actor, UserRole.GROOM)
        ? this.horses.isGroomAssigned(horseId, caller.id)
        : Promise.resolve(false),
    ]);
    return toHorsePermissionsResponse(
      horse.id,
      evaluateHorsePermissions({
        roles: actor.roles,
        isDeleted: horse.deletedAt !== null,
        hasBarn: horse.barnId !== null,
        lifecycleStatus: horse.lifecycleStatus,
        isInTrainerBarn,
        isAssignedGroom,
      }),
    );
  }

  /**
   * Kiểm tra người gọi được sửa những field đã gửi lên (F1.4).
   *
   * - Sở trường cự ly: chỉ Head Trainer phụ trách khu của ngựa (Club Manager gửi thì 403, BA chốt Q-5)
   * - Người không có vai trò Club Manager luôn bị kiểm khu, kể cả khi không gửi field nào (ngựa ngoài khu trả 403)
   * - Các field còn lại: chỉ Club Manager
   * - Người có cả hai vai trò thì được cả hai phần
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @param fields Các field hồ sơ người gọi gửi lên, không gồm version
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu gửi field ngoài quyền, hoặc Head Trainer sửa ngựa ngoài khu mình phụ trách
   */
  private async assertEditableFields(
    actor: Actor,
    callerId: string,
    horseId: string,
    fields: object,
  ): Promise<void> {
    const profileFields = trainerForbiddenFields(fields);
    if (
      profileFields.length > 0 &&
      !this.access.hasRole(actor, UserRole.CLUB_MANAGER)
    ) {
      throw new ForbiddenException(
        `Huấn luyện viên trưởng chỉ được sửa sở trường cự ly, không được sửa: ${profileFields.join(', ')}`,
      );
    }
    if (managerForbiddenFields(fields).length === 0) {
      if (!this.access.hasRole(actor, UserRole.CLUB_MANAGER)) {
        await this.access.assertTrainerBarn(
          this.dataSource.manager,
          actor,
          callerId,
          horseId,
        );
      }
      return;
    }
    if (!this.access.hasRole(actor, UserRole.HEAD_TRAINER)) {
      throw new ForbiddenException(
        'Chỉ Huấn luyện viên trưởng phụ trách khu mới được sửa sở trường cự ly',
      );
    }
    await this.access.assertTrainerBarn(
      this.dataSource.manager,
      actor,
      callerId,
      horseId,
    );
  }

  /**
   * Kiểm tra chủ sở hữu là tài khoản HORSE_OWNER đang hoạt động (F1.2 mục 7), chạy trong transaction ghi hồ sơ
   *
   * - Khóa chia sẻ row tài khoản chủ tới hết transaction, để module users không đổi role hoặc khóa tài khoản đó xen vào giữa lúc kiểm và lúc ghi
   * - null là bỏ trống chủ, luôn hợp lệ
   *
   * @param manager EntityManager của transaction đang chạy
   * @param ownerId UUID chủ sở hữu, null nếu bỏ trống
   * @returns A promise resolving khi kiểm tra xong
   * @throws BadRequestException Nếu tài khoản không tồn tại, không phải HORSE_OWNER hoặc không hoạt động
   */
  private async assertActiveOwner(
    manager: EntityManager,
    ownerId: string | null,
  ): Promise<void> {
    if (!ownerId) return;
    if (!(await this.horses.lockActiveHorseOwner(manager, ownerId))) {
      throw new BadRequestException(
        'Chủ sở hữu phải là tài khoản HORSE_OWNER đang hoạt động',
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

/**
 * Tạo vị trí rỗng cho ngựa không có dòng vị trí (chưa có khu, chưa có ô).
 *
 * @param horseId UUID của ngựa
 * @returns Vị trí với khu và ô đều null
 */
function emptyLocation(horseId: string): HorseLocationRow {
  return {
    horseId,
    barnId: null,
    barnName: null,
    stallId: null,
    stallCode: null,
  };
}
