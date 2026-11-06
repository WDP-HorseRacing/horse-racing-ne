import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { CareScheduleEntity } from '../entity/care-schedule.entity';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { CareSchedulesController, CheckupsController } from './controller';
import { CareSchedulesService, CheckupsService } from './service';

/**
 * Quản lý ngày hẹn khám định kỳ và lịch chăm sóc.
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
