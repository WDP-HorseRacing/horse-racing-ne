import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { HorseGender } from '../constants/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import {
  canTransitionLifecycle,
  evaluateEligibility,
  measurementValueError,
  ownerSharesError,
  parentIdError,
  parentProfileError,
} from '../domain/horse.rules';
import {
  CreateHorseMeasurementDto,
  HorseMeasurementListQueryDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
import {
  CreateHorseDto,
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListQueryDto,
  HorseOwnershipResponseDto,
  HorsePedigreeResponseDto,
  HorseResponseDto,
  SetHorseOwnersDto,
  UpdateHorseDto,
  UpdateHorseHealthDto,
  UpdateHorseLifecycleDto,
} from '../dto/horse.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import {
  toHorseResponse,
  toLatestMeasurement,
  toMeasurementResponse,
  toOwnershipResponse,
  toParentSummary,
} from '../mappers/horse.mapper';
import {
  HorseScope,
  HorsesRepository,
} from '../repositories/horses.repository';

const PEDIGREE_DEFAULT_DEPTH = 2;
const PEDIGREE_MAX_DEPTH = 4;
const CLOCK_SKEW_MS = 60_000;

@Injectable()
export class HorsesService {
  constructor(
    private readonly horsesRepository: HorsesRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List horses, limited to the horses the caller can see
   * @param actor The actor resolved from the JWT
   * @param query The query parameters
   * @returns A promise resolving to a paginated list of horses
   * @throws ForbiddenException if a caller other than a club manager or head trainer filters by reference horses
   */
  async list(
    actor: Actor,
    query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseResponseDto>> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    // Chỉ có CLUB_MANAGER và HEAD_TRAINER mới được xem ngựa tham chiếu
    if (
      query.reference &&
      !this.hasRole(actor, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
    ) {
      throw new ForbiddenException('Không có quyền xem ngựa tham chiếu');
    }
    const [rows, total] = await this.horsesRepository.list(
      this.scopeOf(actor, caller.id),
      query,
    );
    return new PaginationResponseDto(
      rows.map(toHorseResponse),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Get a horse visible to the caller with its parents, latest measurements and training lock state
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @returns A promise resolving to the horse detail
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async get(actor: Actor, id: string): Promise<HorseDetailResponseDto> {
    await this.findVisible(actor, id);
    const horse = await this.horsesRepository.findWithParents(id);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    const [latestMeasurements, activeTrainingLock] = await Promise.all([
      this.horsesRepository.latestMeasurements(id),
      this.horsesRepository.hasActiveTrainingLock(id),
    ]);
    return {
      ...toHorseResponse(horse),
      sire: horse.sire ? toParentSummary(horse.sire) : null,
      dam: horse.dam ? toParentSummary(horse.dam) : null,
      latestMeasurements: latestMeasurements.map(toLatestMeasurement),
      activeTrainingLock,
    };
  }

  /**
   * Create a horse
   * @param actor The actor resolved from the JWT
   * @param body The horse data to create
   * @returns A promise resolving to the created horse
   * @throws BadRequestException if the parents or the avatar media are invalid
   * @throws ConflictException if the pedigree forms a cycle or the microchip ID is already used
   */
  async create(actor: Actor, body: CreateHorseDto): Promise<HorseResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const sireId = body.sireId ?? null;
    const damId = body.damId ?? null;
    await this.validateParents(
      { dateOfBirth: body.dateOfBirth },
      sireId,
      damId,
    );
    await this.validateMedia(body.mediaId);

    const horse = await this.saveUnique(() =>
      this.dataSource.manager.save(HorseEntity, {
        name: body.name.trim(),
        gender: body.gender,
        breed: body.breed ?? null,
        color: body.color ?? null,
        raceAptitude: body.raceAptitude ?? null,
        microchipId: body.microchipId?.trim() || null,
        dateOfBirth: body.dateOfBirth ?? null,
        mediaId: body.mediaId ?? null,
        sireId,
        damId,
        isReference: body.isReference ?? false,
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
   * @throws BadRequestException if the parents or the avatar media are invalid
   * @throws ConflictException if the horse is transferred, the gender change breaks the pedigree, the pedigree forms a cycle or the microchip ID is already used
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(id);
    this.assertNotTransferred(horse);

    if (body.gender !== undefined && body.gender !== horse.gender) {
      await this.assertGenderChangeKeepsPedigree(horse.id, body.gender);
    }

    if (
      body.sireId !== undefined ||
      body.damId !== undefined ||
      body.dateOfBirth !== undefined
    ) {
      await this.validateParents(
        {
          id: horse.id,
          dateOfBirth:
            body.dateOfBirth === undefined
              ? horse.dateOfBirth
              : body.dateOfBirth,
        },
        body.sireId === undefined ? horse.sireId : body.sireId,
        body.damId === undefined ? horse.damId : body.damId,
      );
    }
    if (body.mediaId !== undefined) {
      await this.validateMedia(body.mediaId);
    }

    const changes: Partial<HorseEntity> = { ...body };
    if (body.name !== undefined) changes.name = body.name.trim();
    if (body.microchipId !== undefined) {
      changes.microchipId = body.microchipId?.trim() || null;
    }

    if (Object.keys(changes).length > 0) {
      await this.saveUnique(() =>
        this.dataSource.getRepository(HorseEntity).update({ id }, changes),
      );
    }
    return toHorseResponse(await this.findHorse(id));
  }

  /**
   * Soft delete a horse
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @returns A promise resolving once the horse is deleted
   * @throws NotFoundException if the horse is not found
   * @throws ConflictException if the horse is a parent of another horse or has ownership history
   */
  async remove(actor: Actor, id: string): Promise<void> {
    await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(id);
    const usage = await this.horsesRepository.parentUsage(horse.id);
    if (usage.asSire || usage.asDam) {
      throw new ConflictException(
        'Ngựa đang là cha/mẹ trong phả hệ của ngựa khác, không thể xóa',
      );
    }
    if (await this.horsesRepository.hasOwnershipHistory(horse.id)) {
      throw new ConflictException(
        'Ngựa đã có lịch sử sở hữu, hãy đổi trạng thái vòng đời thay vì xóa',
      );
    }
    await this.dataSource.getRepository(HorseEntity).softDelete({ id });
  }

  /**
   * Change a horse's lifecycle status, closing active ownerships when the horse is transferred
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param body The new lifecycle status
   * @returns A promise resolving to the updated horse
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the horse is a reference horse
   * @throws ConflictException if the lifecycle transition is not allowed
   */
  async updateLifecycle(
    actor: Actor,
    id: string,
    body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(id);
    this.assertOperational(horse);
    if (horse.lifecycleStatus === body.lifecycleStatus) {
      return toHorseResponse(horse);
    }
    if (!canTransitionLifecycle(horse.lifecycleStatus, body.lifecycleStatus)) {
      throw new ConflictException(
        `Không thể chuyển vòng đời từ ${horse.lifecycleStatus} sang ${body.lifecycleStatus}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(HorseEntity)
        .update({ id }, { lifecycleStatus: body.lifecycleStatus });
      if (body.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
        await this.horsesRepository.closeActiveOwnerships(
          manager,
          id,
          this.today(),
        );
      }
    });
    return toHorseResponse(await this.findHorse(id));
  }

  /**
   * Change a horse's health status
   * @param actor The actor resolved from the JWT
   * @param id The ID of the horse
   * @param body The new health status
   * @returns A promise resolving to the updated horse
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the horse is a reference horse
   * @throws ConflictException if the horse is transferred or marked ELIGIBLE while under an active training lock
   */
  async updateHealth(
    actor: Actor,
    id: string,
    body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(id);
    this.assertOperational(horse);
    this.assertNotTransferred(horse);
    if (
      body.healthStatus === HorseHealthStatus.ELIGIBLE &&
      (await this.horsesRepository.hasActiveTrainingLock(id))
    ) {
      throw new ConflictException(
        'Ngựa đang bị khóa huấn luyện, cần giải khóa trước khi chuyển sang ELIGIBLE',
      );
    }
    await this.dataSource
      .getRepository(HorseEntity)
      .update({ id }, { healthStatus: body.healthStatus });
    return toHorseResponse(await this.findHorse(id));
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
    const horse = await this.findVisible(actor, id);
    const depth = this.parsePedigreeDepth(depthInput);
    const ancestors = await this.horsesRepository.findPedigreeAncestors(
      id,
      depth,
    );
    return { horseId: horse.id, horseName: horse.name, depth, ancestors };
  }

  /**
   * List the ownership history of a horse visible to the caller
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @returns A promise resolving to the ownerships of the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async listOwners(
    actor: Actor,
    horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    await this.findVisible(actor, horseId);
    const ownerships =
      await this.horsesRepository.listOwnershipByHorse(horseId);
    return ownerships.map(toOwnershipResponse);
  }

  /**
   * Close the active ownerships of a horse and replace them with a new set of owners starting today
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param body The new owners and their share percentages
   * @returns A promise resolving to the ownerships of the horse
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the horse is a reference horse, the shares are invalid or an owner is not an active horse owner
   * @throws ConflictException if the horse is transferred
   */
  async replaceOwners(
    actor: Actor,
    horseId: string,
    body: SetHorseOwnersDto,
  ): Promise<HorseOwnershipResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(horseId);
    this.assertOperational(horse);
    this.assertNotTransferred(horse);

    const sharesError = ownerSharesError(body.owners);
    if (sharesError) throw new BadRequestException(sharesError);

    const ownerIds = body.owners.map((owner) => owner.ownerId);
    const owners = await this.dataSource.getRepository(UserEntity).find({
      where: {
        id: In(ownerIds),
        role: UserRole.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      },
    });
    if (owners.length !== ownerIds.length) {
      throw new BadRequestException(
        'Chủ sở hữu phải là tài khoản HORSE_OWNER đang hoạt động',
      );
    }

    const today = this.today();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(HorseEntity).findOne({
        where: { id: horseId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.horsesRepository.closeActiveOwnerships(
        manager,
        horseId,
        today,
      );
      const ownerships = manager.getRepository(HorseOwnershipEntity);
      await ownerships.save(
        body.owners.map((owner) =>
          ownerships.create({
            horseId,
            ownerId: owner.ownerId,
            percentage: owner.percentage.toFixed(2),
            startDate: today,
            endDate: null,
          }),
        ),
      );
    });

    return this.listOwners(actor, horseId);
  }

  /**
   * List the horses currently owned by the caller
   * @param actor The actor resolved from the JWT
   * @returns A promise resolving to the caller's horses
   */
  async listMyHorses(actor: Actor): Promise<HorseResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horses = await this.horsesRepository.listOwnedBy(caller.id);
    return horses.map(toHorseResponse);
  }

  /**
   * List the measurements of a horse visible to the caller
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param query The query parameters
   * @returns A promise resolving to the measurements of the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async listMeasurements(
    actor: Actor,
    horseId: string,
    query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    await this.findVisible(actor, horseId);
    const measurements = await this.horsesRepository.listMeasurements(
      horseId,
      query.type,
    );
    return measurements.map(toMeasurementResponse);
  }

  /**
   * Record a measurement for a horse visible to the caller
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param body The measurement data
   * @returns A promise resolving to the created measurement
   * @throws NotFoundException if the horse is not found or not visible to the caller
   * @throws ForbiddenException if the caller is a head trainer and the horse is not in their barn
   * @throws BadRequestException if the horse is a reference horse, the value is out of range or the measured time is in the future
   * @throws ConflictException if the horse is transferred
   */
  async addMeasurement(
    actor: Actor,
    horseId: string,
    body: CreateHorseMeasurementDto,
  ): Promise<HorseMeasurementResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findVisible(actor, horseId);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    this.assertOperational(horse);
    this.assertNotTransferred(horse);

    const valueError = measurementValueError(body.type, body.value);
    if (valueError) throw new BadRequestException(valueError);

    const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
    if (measuredAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new BadRequestException('Thời điểm đo không được ở tương lai');
    }

    const measurement = await this.horsesRepository.addMeasurement({
      horseId,
      type: body.type,
      value: body.value.toFixed(2),
      measuredAt,
      measuredBy: caller.id,
    });
    return toMeasurementResponse(measurement);
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
    const horse = await this.findVisible(actor, horseId);
    const activeTrainingLock =
      await this.horsesRepository.hasActiveTrainingLock(horseId);
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
   * Find a horse that is visible within the caller's scope
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @returns A promise resolving to the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async findVisible(actor: Actor, horseId: string): Promise<HorseEntity> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(horseId);
    const visible = await this.horsesRepository.isVisible(
      horseId,
      this.scopeOf(actor, caller.id),
    );
    if (!visible) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Resolve the horse visibility scope from the actor's roles
   * @param actor The actor resolved from the JWT
   * @param userId The ID of the caller
   * @returns The GROOM or OWNER scope for those roles, otherwise the ALL scope
   */
  private scopeOf(actor: Actor, userId: string): HorseScope {
    if (this.hasRole(actor, UserRole.GROOM)) {
      return { kind: 'GROOM', userId };
    }
    if (this.hasRole(actor, UserRole.HORSE_OWNER)) {
      return { kind: 'OWNER', userId };
    }
    return { kind: 'ALL' };
  }

  /**
   * Check whether the actor has any of the given roles
   * @param actor The actor resolved from the JWT
   * @param roles The roles to check
   * @returns True if the actor has at least one of the roles
   */
  private hasRole(actor: Actor, ...roles: UserRole[]): boolean {
    return roles.some((role) => actor.roles.includes(role));
  }

  /**
   * Find a horse by id
   * @param id The ID of the horse
   * @returns A promise resolving to the horse
   * @throws NotFoundException if the horse is not found
   */
  private async findHorse(id: string): Promise<HorseEntity> {
    const horse = await this.horsesRepository.findById(id);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Ensure the horse is not a reference horse
   * @param horse The horse to check
   * @throws BadRequestException if the horse is a reference horse
   */
  private assertOperational(horse: HorseEntity): void {
    if (horse.isReference) {
      throw new BadRequestException(
        'Ngựa tham chiếu chỉ dùng cho phả hệ, không áp dụng thao tác này',
      );
    }
  }

  /**
   * Ensure the horse has not been transferred
   * @param horse The horse to check
   * @throws ConflictException if the horse is transferred
   */
  private assertNotTransferred(horse: HorseEntity): void {
    if (horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
      throw new ConflictException('Ngựa đã chuyển nhượng, hồ sơ chỉ được xem');
    }
  }

  /**
   * Validate the sire and dam of a horse against their profiles and the existing pedigree
   * @param child The ID and date of birth of the horse, without an ID when creating
   * @param sireId The ID of the sire
   * @param damId The ID of the dam
   * @returns A promise resolving once the check passes
   * @throws BadRequestException if a parent is the horse itself, the parents are the same, a parent does not exist, or a parent has the wrong gender or a later date of birth
   * @throws ConflictException if a parent would create a cycle in the pedigree
   */
  private async validateParents(
    child: { id?: string; dateOfBirth?: string | null },
    sireId: string | null,
    damId: string | null,
  ): Promise<void> {
    // Đảm bảo cha/mẹ không trùng nhau và không phải là chính ngựa đó
    const idError = parentIdError(child.id, sireId, damId);
    if (idError) throw new BadRequestException(idError);

    const sire = sireId ? await this.findParent(sireId, 'Sire') : null;
    const dam = damId ? await this.findParent(damId, 'Dam') : null;

    // Check giới tính và ngày sinh của cha/mẹ
    const profileError = parentProfileError(child, sire, dam);
    if (profileError) throw new BadRequestException(profileError);

    const childId = child.id;
    if (!childId) return;
    for (const parent of [sire, dam]) {
      if (
        parent &&
        (await this.horsesRepository.wouldCreateCycle(childId, parent.id))
      ) {
        throw new ConflictException('Quan hệ cha/mẹ tạo thành vòng lặp phả hệ');
      }
    }
  }

  /**
   * Find a parent horse
   * @param id The ID of the parent horse
   * @param label The parent label used in the error message
   * @returns A promise resolving to the parent horse
   * @throws BadRequestException if the parent does not exist
   */
  private async findParent(id: string, label: string): Promise<HorseEntity> {
    const parent = await this.horsesRepository.findById(id);
    if (!parent) {
      throw new BadRequestException(`${label} không tồn tại`);
    }
    return parent;
  }

  /**
   * Ensure a gender change keeps the horse valid as a sire or dam of other horses
   * @param horseId The ID of the horse
   * @param gender The new gender
   * @returns A promise resolving once the check passes
   * @throws ConflictException if the horse is a sire changing to FEMALE or a dam changing away from FEMALE
   */
  private async assertGenderChangeKeepsPedigree(
    horseId: string,
    gender: HorseGender,
  ): Promise<void> {
    const usage = await this.horsesRepository.parentUsage(horseId);
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
   * Run a write operation and map a unique violation to a microchip conflict
   * @param operation The write operation to run
   * @returns A promise resolving to the operation result
   * @throws ConflictException if the microchip ID is already used
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException('Microchip đã được dùng cho ngựa khác');
      }
      throw error;
    }
  }

  /**
   * Get today's date in UTC
   * @returns The date as YYYY-MM-DD
   */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
