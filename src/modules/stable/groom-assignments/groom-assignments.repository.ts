import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';

export interface GroomWorkloadRow {
  groomId: string;
  fullName: string;
  activeHorseCount: number;
}

@Injectable()
export class GroomAssignmentsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getGroomWorkloads(): Promise<GroomWorkloadRow[]> {
    return this.dataSource.manager
      .createQueryBuilder(UserEntity, 'u')
      .select('u.id', 'groomId')
      .addSelect('u.fullName', 'fullName')
      .addSelect('COUNT(h.id)::int', 'activeHorseCount')
      .leftJoin(
        GroomAssignmentEntity,
        'ga',
        'ga.groomId = u.id AND ga.endAt IS NULL',
      )
      .leftJoin(HorseEntity, 'h', 'h.id = ga.horseId AND h.deletedAt IS NULL')
      .where('u.role = :role', { role: UserRole.GROOM })
      .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
      .groupBy('u.id')
      .addGroupBy('u.fullName')
      .orderBy('"activeHorseCount"', 'DESC')
      .addOrderBy('u.fullName', 'ASC')
      .getRawMany<GroomWorkloadRow>();
  }
}
