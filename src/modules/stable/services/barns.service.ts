import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { BarnStatus } from '../constants/barn-status.enum';
import { BarnResponseDto, CreateBarnDto, UpdateBarnDto } from '../dto/barn.dto';
import { BarnEntity } from '../entities/barn.entity';
import { StallEntity } from '../entities/stall.entity';
import { toBarnResponse } from '../mappers/barn.mapper';

@Injectable()
export class BarnsService {
  constructor(
    @InjectRepository(BarnEntity)
    private readonly barnRepository: Repository<BarnEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List the barns
   * @param actor The actor resolved from the JWT
   * @returns A promise resolving to the barns ordered by name
   */
  async list(actor: Actor): Promise<BarnResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const barns = await this.barnRepository.find({
      order: { name: 'ASC' },
    });
    return barns.map((barn) => toBarnResponse(barn));
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
   * Create a barn
   * @param actor The actor resolved from the JWT
   * @param body The barn data
   * @returns A promise resolving to the created barn
   * @throws ConflictException if the name is already used
   */
  async create(actor: Actor, body: CreateBarnDto): Promise<BarnResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const name = body.name.trim();
    const exists = await this.barnRepository.existsBy({ name });
    if (exists) {
      throw new ConflictException('Tên khu chuồng đã tồn tại');
    }

    const barn = this.barnRepository.create({
      name,
      description: body.description?.trim() ?? null,
      capacity: body.capacity ?? null,
      status: body.status ?? BarnStatus.ACTIVE,
      headTrainerId: null,
    });

    const saved = await this.saveUnique(() => this.barnRepository.save(barn));
    return toBarnResponse(saved);
  }

  /**
   * Rename a barn or change its head trainer
   * @param actor The actor resolved from the JWT
   * @param barnId The ID of the barn
   * @param body The fields to change
   * @returns A promise resolving to the updated barn
   * @throws NotFoundException if the barn is not found
   * @throws BadRequestException if the head trainer is not an active HEAD_TRAINER
   * @throws ConflictException if the name is already used
   */
  async update(
    actor: Actor,
    barnId: string,
    body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const barn = await this.barnRepository.findOneBy({ id: barnId });
    if (!barn) throw new NotFoundException('Không tìm thấy khu chuồng');

    if (body.headTrainerId) {
      const isValidTrainer = await this.dataSource.manager.exists(UserEntity, {
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

    const updates = Object.fromEntries(
      Object.entries({
        name: body.name?.trim(),
        headTrainerId: body.headTrainerId,
        description:
          body.description !== undefined
            ? (body.description?.trim() ?? null)
            : undefined,
        capacity: body.capacity,
        status: body.status,
      }).filter(([_, value]) => value !== undefined),
    );
    Object.assign(barn, updates);
    const saved = await this.saveUnique(() => this.barnRepository.save(barn));
    return toBarnResponse(saved);
  }

  /**
   * Soft-delete a barn
   * @param actor The actor resolved from the JWT
   * @param barnId The ID of the barn to delete
   * @throws NotFoundException if the barn is not found
   * @throws ConflictException if the barn still contains stalls
   */
  async remove(actor: Actor, barnId: string): Promise<void> {
    await currentUserForActor(this.dataSource.manager, actor);

    const barn = await this.barnRepository.findOneBy({ id: barnId });
    if (!barn) throw new NotFoundException('Không tìm thấy khu chuồng');

    const hasStalls = await this.dataSource.manager.exists(StallEntity, {
      where: { barnId },
    });
    if (hasStalls) {
      throw new ConflictException(
        'Không thể xóa khu chuồng khi vẫn còn ô chuồng bên trong',
      );
    }

    await this.barnRepository.softDelete({ id: barnId });
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
