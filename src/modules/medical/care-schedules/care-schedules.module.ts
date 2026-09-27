import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { CareSchedulesController } from './care-schedules.controller';
import { CareSchedulesService } from './care-schedules.service';
import { CheckupsController } from './checkups.controller';
import { CheckupsService } from './checkups.service';

/**
 * Owns routine checkup appointments (F3.2) and care schedules (F3.11).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CareScheduleEntity]),
    HorsesSharedModule,
    MedicalSharedModule,
    AuditModule,
  ],
  controllers: [CareSchedulesController, CheckupsController],
  providers: [CareSchedulesService, CheckupsService],
})
export class CareSchedulesModule {}
