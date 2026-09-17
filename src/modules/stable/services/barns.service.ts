import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { BarnResponseDto, CreateBarnDto, UpdateBarnDto } from '../dto/barn.dto';
import { BarnEntity } from '../entities/barn.entity';

@Injectable()
export class BarnsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * List the barns
   * @param actor The actor resolved from the JWT
   * @returns A promise resolving to the barns ordered by name
   */
  async list(actor: Actor): Promise<BarnResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const barns = await this.dataSource.getRepository(BarnEntity).find({
      order: { name: 'ASC' },
    });
    return barns.map((barn) => this.toResponse(barn));
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
    const barn = await this.saveUnique(() =>
      this.dataSource.getRepository(BarnEntity).save({
        name: body.name.trim(),
        headTrainerId: null,
      }),
    );
    return this.toResponse(barn);
  }

  /**
   * Rename a barn or change its head trainer
   * @param actor The actor resolved from the JWT
   * @param id The ID of the barn
   * @param body The fields to change
   * @returns A promise resolving to the updated barn
   * @throws NotFoundException if the barn is not found
   * @throws BadRequestException if the head trainer is not an active HEAD_TRAINER
   * @throws ConflictException if the name is already used
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const repository = this.dataSource.getRepository(BarnEntity);
    const barn = await repository.findOneBy({ id });
    if (!barn) throw new NotFoundException('Không tìm thấy khu chuồng');

    if (body.headTrainerId) {
      const trainer = await this.dataSource
        .getRepository(UserEntity)
        .findOneBy({
          id: body.headTrainerId,
          role: UserRole.HEAD_TRAINER,
          status: UserStatus.ACTIVE,
        });
      if (!trainer) {
        throw new BadRequestException(
          'Người phụ trách phải là Head Trainer đang hoạt động',
        );
      }
    }

    if (body.name !== undefined) barn.name = body.name.trim();
    if (body.headTrainerId !== undefined) {
      barn.headTrainerId = body.headTrainerId;
    }
    const saved = await this.saveUnique(() => repository.save(barn));
    return this.toResponse(saved);
  }

  /**
   * Map a barn entity to its response
   * @param barn The barn entity
   * @returns The barn response
   */
  private toResponse(barn: BarnEntity): BarnResponseDto {
    return {
      id: barn.id,
      name: barn.name,
      headTrainerId: barn.headTrainerId,
    };
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
