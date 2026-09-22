import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindOptionsWhere,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { BarnStatus } from '../constants/barn-status.enum';
import { StallStatus } from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';
import {
  CreateStallAssignmentDto,
  CreateStallDto,
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

@Injectable()
export class StallsService {
  constructor(
    @InjectRepository(StallEntity)
    private readonly stallRepository: Repository<StallEntity>,
    @InjectRepository(StallAssignmentEntity)
    private readonly stallAssignmentRepository: Repository<StallAssignmentEntity>,
    private readonly dataSource: DataSource,
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
   * Create a new stall
   * @param actor The actor resolved from the JWT
   * @param body The stall data
   * @returns A promise resolving to the created stall
   * @throws NotFoundException if the barn is not found
   * @throws BadRequestException if the barn is not active
   * @throws ConflictException if the barn reached its capacity or code already exists
   */
  async create(actor: Actor, body: CreateStallDto): Promise<StallResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const barn = await this.dataSource.manager.findOne(BarnEntity, {
      where: { id: body.barnId },
    });
    if (!barn) {
      throw new NotFoundException('Không tìm thấy khu chuồng');
    }
    if (barn.status !== BarnStatus.ACTIVE) {
      throw new BadRequestException('Khu chuồng không ở trạng thái hoạt động');
    }
    if (barn.capacity !== null) {
      const currentCount = await this.stallRepository.countBy({
        barnId: body.barnId,
      });
      if (currentCount >= barn.capacity) {
        throw new ConflictException(
          `Khu chuồng đã đạt sức chứa tối đa (${barn.capacity} ô chuồng)`,
        );
      }
    }

    const code = body.code.trim();
    const exists = await this.stallRepository.existsBy({ code });
    if (exists) {
      throw new ConflictException('Mã ô chuồng đã tồn tại');
    }

    const stall = this.stallRepository.create({
      barnId: body.barnId,
      code,
      type: body.type ?? StallType.STANDARD,
      status: body.status ?? StallStatus.AVAILABLE,
      description: body.description?.trim() ?? null,
      hasCamera: body.hasCamera ?? false,
    });

    const saved = await this.saveUnique(() => this.stallRepository.save(stall));
    return toStallResponse(saved);
  }

  /**
   * Update a stall
   * @param actor The actor resolved from the JWT
   * @param id The ID of the stall
   * @param body The fields to change
   * @returns A promise resolving to the updated stall
   * @throws NotFoundException if the stall or target barn is not found
   * @throws ConflictException if code already exists or target barn reached capacity
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateStallDto,
  ): Promise<StallResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const stall = await this.stallRepository.findOneBy({ id });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');

    if (body.barnId && body.barnId !== stall.barnId) {
      const targetBarn = await this.dataSource.manager.findOne(BarnEntity, {
        where: { id: body.barnId },
      });
      if (!targetBarn) {
        throw new NotFoundException('Không tìm thấy khu chuồng đích');
      }
      if (targetBarn.status !== BarnStatus.ACTIVE) {
        throw new BadRequestException(
          'Khu chuồng đích không ở trạng thái hoạt động',
        );
      }
      if (targetBarn.capacity !== null) {
        const count = await this.stallRepository.countBy({
          barnId: body.barnId,
        });
        if (count >= targetBarn.capacity) {
          throw new ConflictException(
            `Khu chuồng đích đã đạt sức chứa tối đa (${targetBarn.capacity} ô chuồng)`,
          );
        }
      }
    }

    const updates = Object.fromEntries(
      Object.entries({
        barnId: body.barnId,
        code: body.code?.trim(),
        type: body.type,
        status: body.status,
        description:
          body.description !== undefined
            ? (body.description?.trim() ?? null)
            : undefined,
        hasCamera: body.hasCamera,
      }).filter(([_, value]) => value !== undefined),
    );
    Object.assign(stall, updates);

    const saved = await this.saveUnique(() => this.stallRepository.save(stall));
    return toStallResponse(saved);
  }

  /**
   * Soft-delete a stall
   * @param actor The actor resolved from the JWT
   * @param id The ID of the stall
   * @throws NotFoundException if the stall is not found
   * @throws ConflictException if the stall currently has an active assignment
   */
  async remove(actor: Actor, id: string): Promise<void> {
    await currentUserForActor(this.dataSource.manager, actor);

    const stall = await this.stallRepository.findOneBy({ id });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');

    const hasActiveAssignment = await this.stallAssignmentRepository.exists({
      where: { stallId: id, endAt: IsNull() },
    });
    if (hasActiveAssignment) {
      throw new ConflictException(
        'Không thể xóa ô chuồng đang có ngựa phân công',
      );
    }

    await this.stallRepository.softDelete({ id });
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
   * Assign a horse to a stall
   * @param actor The actor resolved from the JWT
   * @param stallId The ID of the stall
   * @param body The assignment data
   * @returns A promise resolving to the created assignment
   * @throws NotFoundException if stall or horse not found
   * @throws BadRequestException if stall is not AVAILABLE, its barn is not ACTIVE, the horse is a reference horse, or the start time is invalid
   * @throws ConflictException if stall or horse is already actively assigned
   */
  async assign(
    actor: Actor,
    stallId: string,
    body: CreateStallAssignmentDto,
  ): Promise<StallAssignmentResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const stall = await this.stallRepository.findOneBy({ id: stallId });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
    if (stall.status !== StallStatus.AVAILABLE) {
      throw new BadRequestException('Ô chuồng không ở trạng thái khả dụng');
    }
    const isBarnActive = await this.dataSource.manager.existsBy(BarnEntity, {
      id: stall.barnId,
      status: BarnStatus.ACTIVE,
    });
    if (!isBarnActive) {
      throw new BadRequestException('Khu chuồng không ở trạng thái hoạt động');
    }

    const isStallOccupied = await this.stallAssignmentRepository.exists({
      where: { stallId, endAt: IsNull() },
    });
    if (isStallOccupied) {
      throw new ConflictException(
        'Ô chuồng đang có ngựa ở (chưa kết thúc phân công)',
      );
    }

    const horse = await this.dataSource.manager.findOne(HorseEntity, {
      where: { id: body.horseId },
    });
    if (!horse) {
      throw new NotFoundException('Không tìm thấy thông tin ngựa');
    }
    if (horse.isReference) {
      throw new BadRequestException(
        'Ngựa tham chiếu không thuộc đàn, không xếp chuồng được',
      );
    }

    const isHorseAssigned = await this.stallAssignmentRepository.exists({
      where: { horseId: body.horseId, endAt: IsNull() },
    });
    if (isHorseAssigned) {
      throw new ConflictException(
        'Ngựa này hiện đang được xếp ở một ô chuồng khác',
      );
    }

    const startAt = new Date(body.startAt);
    if (isNaN(startAt.getTime())) {
      throw new BadRequestException('Thời điểm bắt đầu không hợp lệ');
    }

    return await this.dataSource.transaction(async (manager) => {
      const assignment = manager.create(StallAssignmentEntity, {
        stallId,
        horseId: body.horseId,
        startAt,
        endAt: null,
      });
      const saved = await manager.save(StallAssignmentEntity, assignment);

      stall.status = StallStatus.OCCUPIED;
      await manager.save(StallEntity, stall);

      saved.horse = horse;

      return toStallAssignmentResponse(saved);
    });
  }

  /**
   * End an active stall assignment
   * @param actor The actor resolved from the JWT
   * @param assignmentId The ID of the assignment
   * @returns A promise resolving to the ended assignment
   * @throws NotFoundException if assignment is not found
   * @throws BadRequestException if assignment was already ended
   */
  async endAssignment(
    actor: Actor,
    assignmentId: string,
  ): Promise<StallAssignmentResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const assignment = await this.stallAssignmentRepository.findOne({
      where: { id: assignmentId },
      relations: ['horse'],
    });
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy lượt phân công chuồng');
    }
    if (assignment.endAt !== null) {
      throw new BadRequestException(
        'Lượt phân công chuồng này đã kết thúc trước đó',
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      assignment.endAt = new Date();
      const saved = await manager.save(StallAssignmentEntity, assignment);

      const stall = await manager.findOne(StallEntity, {
        where: { id: assignment.stallId },
      });
      if (stall && stall.status === StallStatus.OCCUPIED) {
        stall.status = StallStatus.AVAILABLE;
        await manager.save(StallEntity, stall);
      }

      return toStallAssignmentResponse(saved);
    });
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
