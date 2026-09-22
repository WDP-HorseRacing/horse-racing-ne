import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseProfilesController } from './horse-profiles.controller';
import { HorseProfilesRepository } from './horse-profiles.repository';
import { HorseProfilesService } from './horse-profiles.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HorseEntity,
      HorseOwnershipEntity,
      HorseMeasurementEntity,
      GroomAssignmentEntity,
    ]),
    HorsesSharedModule,
    AuditModule,
  ],
  controllers: [HorseProfilesController],
  providers: [HorseProfilesRepository, HorseProfilesService],
})
export class HorseProfilesModule {}
