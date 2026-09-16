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
  toOwnershipResponse,
  toLatestMeasurement,
  toMeasurementResponse,
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

  async list(
    actor: Actor,
    query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseResponseDto>> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    if (
      query.reference &&
      !this.hasRole(actor, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
    ) {
      throw new ForbiddenException('Không có quyền xem ngựa tham chiếu');
    }
    const [rows, total] = await this.horsesRepository.list(
      caller.clubId,
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

  async get(actor: Actor, id: string): Promise<HorseDetailResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.findVisible(actor, id);
    const horse = await this.horsesRepository.findWithParents(
      id,
      caller.clubId,
    );
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

  async create(actor: Actor, body: CreateHorseDto): Promise<HorseResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const sireId = body.sireId ?? null;
    const damId = body.damId ?? null;
    await this.validateParents(
      clubId,
      { dateOfBirth: body.dateOfBirth },
      sireId,
      damId,
    );
    await this.validateMedia(clubId, body.mediaId);

    const horse = await this.saveUnique(() =>
      this.dataSource.manager.save(HorseEntity, {
        clubId,
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

  async update(
    actor: Actor,
    id: string,
    body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const horse = await this.findInClub(id, clubId);
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
        clubId,
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
      await this.validateMedia(clubId, body.mediaId);
    }

    const changes: Partial<HorseEntity> = { ...body };
    if (body.name !== undefined) changes.name = body.name.trim();
    if (body.microchipId !== undefined) {
      changes.microchipId = body.microchipId?.trim() || null;
    }

    if (Object.keys(changes).length > 0) {
      await this.saveUnique(() =>
        this.dataSource
          .getRepository(HorseEntity)
          .update({ id, clubId }, changes),
      );
    }
    return toHorseResponse(await this.findInClub(id, clubId));
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const horse = await this.findInClub(id, clubId);
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
    await this.dataSource.getRepository(HorseEntity).softDelete({ id, clubId });
  }

  async updateLifecycle(
    actor: Actor,
    id: string,
    body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const horse = await this.findInClub(id, clubId);
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
        .update({ id, clubId }, { lifecycleStatus: body.lifecycleStatus });
      if (body.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
        await this.horsesRepository.closeActiveOwnerships(
          manager,
          id,
          this.today(),
        );
      }
    });
    return toHorseResponse(await this.findInClub(id, clubId));
  }

  async updateHealth(
    actor: Actor,
    id: string,
    body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const horse = await this.findInClub(id, clubId);
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
      .update({ id, clubId }, { healthStatus: body.healthStatus });
    return toHorseResponse(await this.findInClub(id, clubId));
  }

  async getPedigree(
    actor: Actor,
    id: string,
    depthInput?: string,
  ): Promise<HorsePedigreeResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findVisible(actor, id);
    const depth = this.parsePedigreeDepth(depthInput);
    const ancestors = await this.horsesRepository.findPedigreeAncestors(
      id,
      caller.clubId,
      depth,
    );
    return { horseId: horse.id, horseName: horse.name, depth, ancestors };
  }

  async listOwners(
    actor: Actor,
    horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    await this.findVisible(actor, horseId);
    const ownerships =
      await this.horsesRepository.listOwnershipByHorse(horseId);
    return ownerships.map(toOwnershipResponse);
  }

  async replaceOwners(
    actor: Actor,
    horseId: string,
    body: SetHorseOwnersDto,
  ): Promise<HorseOwnershipResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const clubId = caller.clubId;
    const horse = await this.findInClub(horseId, clubId);
    this.assertOperational(horse);
    this.assertNotTransferred(horse);

    const sharesError = ownerSharesError(body.owners);
    if (sharesError) throw new BadRequestException(sharesError);

    const ownerIds = body.owners.map((owner) => owner.ownerId);
    const owners = await this.dataSource.getRepository(UserEntity).find({
      where: {
        id: In(ownerIds),
        clubId,
        role: UserRole.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      },
    });
    if (owners.length !== ownerIds.length) {
      throw new BadRequestException(
        'Chủ sở hữu phải là tài khoản HORSE_OWNER đang hoạt động trong câu lạc bộ',
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

  async listMyHorses(actor: Actor): Promise<HorseResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horses = await this.horsesRepository.listOwnedBy(
      caller.id,
      caller.clubId,
    );
    return horses.map(toHorseResponse);
  }

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

  async addMeasurement(
    actor: Actor,
    horseId: string,
    body: CreateHorseMeasurementDto,
  ): Promise<HorseMeasurementResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findVisible(actor, horseId);
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

  async findVisible(actor: Actor, horseId: string): Promise<HorseEntity> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findInClub(horseId, caller.clubId);
    const visible = await this.horsesRepository.isVisible(
      horseId,
      this.scopeOf(actor, caller.id),
    );
    if (!visible) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  private scopeOf(actor: Actor, userId: string): HorseScope {
    if (this.hasRole(actor, UserRole.GROOM)) {
      return { kind: 'GROOM', userId };
    }
    if (this.hasRole(actor, UserRole.HORSE_OWNER)) {
      return { kind: 'OWNER', userId };
    }
    return { kind: 'CLUB' };
  }

  private hasRole(actor: Actor, ...roles: UserRole[]): boolean {
    return roles.some((role) => actor.roles.includes(role));
  }

  private async findInClub(id: string, clubId: string): Promise<HorseEntity> {
    const horse = await this.horsesRepository.findInClub(id, clubId);
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  private assertOperational(horse: HorseEntity): void {
    if (horse.isReference) {
      throw new BadRequestException(
        'Ngựa tham chiếu chỉ dùng cho phả hệ, không áp dụng thao tác này',
      );
    }
  }

  private assertNotTransferred(horse: HorseEntity): void {
    if (horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
      throw new ConflictException('Ngựa đã chuyển nhượng, hồ sơ chỉ được xem');
    }
  }

  private async validateParents(
    clubId: string,
    child: { id?: string; dateOfBirth?: string | null },
    sireId: string | null,
    damId: string | null,
  ): Promise<void> {
    const idError = parentIdError(child.id, sireId, damId);
    if (idError) throw new BadRequestException(idError);

    const sire = sireId ? await this.findParent(sireId, clubId, 'Sire') : null;
    const dam = damId ? await this.findParent(damId, clubId, 'Dam') : null;

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

  private async findParent(
    id: string,
    clubId: string,
    label: string,
  ): Promise<HorseEntity> {
    const parent = await this.horsesRepository.findInClub(id, clubId);
    if (!parent) {
      throw new BadRequestException(`${label} không tồn tại trong câu lạc bộ`);
    }
    return parent;
  }

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

  private async validateMedia(
    clubId: string,
    mediaId: string | null | undefined,
  ): Promise<void> {
    if (!mediaId) return;
    const media = await this.dataSource
      .getRepository(MediaAssetEntity)
      .findOneBy({ id: mediaId, clubId });
    if (!media || !media.mimeType.startsWith('image/')) {
      throw new BadRequestException(
        'Ảnh đại diện phải là file ảnh thuộc câu lạc bộ',
      );
    }
  }

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

  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException(
          'Microchip đã được dùng cho ngựa khác trong câu lạc bộ',
        );
      }
      throw error;
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
