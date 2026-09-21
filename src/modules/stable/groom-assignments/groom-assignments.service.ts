import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, QueryFailedError } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  AssignGroomDto,
  GroomAssignmentResponseDto,
} from '../dto/groom-assignment.dto';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { toGroomAssignmentResponse } from '../mappers/groom-assignment.mapper';
import { assertTrainerBarn } from '../utils/trainer-barn';

@Injectable()
export class GroomAssignmentsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * List the groom history of a horse, newest first
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @returns A promise resolving to the groom assignments of the horse
   * @throws NotFoundException if the horse is not found
   */
  async listByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<GroomAssignmentResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    await this.findHorse(horseId);
    const assignments = await this.dataSource.manager.find(
      GroomAssignmentEntity,
      {
        where: { horseId },
        relations: { groom: true },
        order: { startAt: 'DESC' },
      },
    );
    return assignments.map(toGroomAssignmentResponse);
  }

  /**
   * Assign a groom to a horse, closing the current groom assignment when the groom changes
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param body The groom to assign
   * @returns A promise resolving to the open groom assignment
   * @throws NotFoundException if the horse is not found
   * @throws BadRequestException if the horse is a reference horse or the groom is not an active groom
   * @throws ConflictException if the horse is transferred or another groom was assigned at the same time
   * @throws ForbiddenException if the caller is a head trainer and the horse is not in their barn
   */
  async assign(
    actor: Actor,
    horseId: string,
    body: AssignGroomDto,
  ): Promise<GroomAssignmentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const horse = await this.findHorse(horseId);
    this.assertCanHaveGroom(horse);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const groom = await this.dataSource.manager.findOneBy(UserEntity, {
      id: body.groomId,
      role: UserRole.GROOM,
      status: UserStatus.ACTIVE,
    });
    if (!groom) {
      throw new BadRequestException(
        'Groom phụ trách không hợp lệ hoặc không ở trạng thái hoạt động',
      );
    }

    return this.saveUnique(() =>
      this.dataSource.transaction(async (manager) => {
        const current = await manager.findOneBy(GroomAssignmentEntity, {
          horseId,
          endAt: IsNull(),
        });
        if (current?.groomId === groom.id) {
          return toGroomAssignmentResponse({ ...current, groom });
        }
        const now = new Date();
        if (current) {
          await manager.update(
            GroomAssignmentEntity,
            { id: current.id },
            { endAt: now },
          );
        }
        const saved = await manager.save(
          manager.create(GroomAssignmentEntity, {
            horseId,
            groomId: groom.id,
            startAt: now,
            endAt: null,
          }),
        );
        return toGroomAssignmentResponse({ ...saved, groom });
      }),
    );
  }

  /**
   * End the current groom assignment of a horse
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @returns A promise resolving once the assignment is ended
   * @throws NotFoundException if the horse is not found or has no groom
   * @throws ForbiddenException if the caller is a head trainer and the horse is not in their barn
   */
  async end(actor: Actor, horseId: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.findHorse(horseId);
    await assertTrainerBarn(this.dataSource.manager, actor, caller.id, horseId);
    const result = await this.dataSource.manager.update(
      GroomAssignmentEntity,
      { horseId, endAt: IsNull() },
      { endAt: new Date() },
    );
    if (!result.affected) {
      throw new NotFoundException('Ngựa chưa có groom phụ trách');
    }
  }

  /**
   * Find a horse that has not been deleted
   * @param horseId The ID of the horse
   * @returns A promise resolving to the horse
   * @throws NotFoundException if the horse is not found
   */
  private async findHorse(horseId: string): Promise<HorseEntity> {
    const horse = await this.dataSource.manager.findOneBy(HorseEntity, {
      id: horseId,
    });
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Ensure the horse belongs to the club herd and can be cared for by a groom
   * @param horse The horse to check
   * @throws BadRequestException if the horse is a reference horse
   * @throws ConflictException if the horse is transferred
   */
  private assertCanHaveGroom(horse: HorseEntity): void {
    if (horse.isReference) {
      throw new BadRequestException(
        'Ngựa tham chiếu không thuộc đàn, không giao groom được',
      );
    }
    if (horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED) {
      throw new ConflictException(
        'Ngựa đã chuyển nhượng, không giao groom được',
      );
    }
  }

  /**
   * Run a write operation and map a unique violation to a concurrent assignment conflict
   * @param operation The write operation to run
   * @returns A promise resolving to the operation result
   * @throws ConflictException if another groom was assigned to the horse at the same time
   */
  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException(
          'Ngựa vừa được giao groom khác, vui lòng tải lại',
        );
      }
      throw error;
    }
  }
}
