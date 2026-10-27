import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { HealthStatusesController } from './health-statuses.controller';
import { HealthStatusesRepository } from './health-statuses.repository';
import { HealthStatusesService } from './health-statuses.service';

/**
 * Quản lý việc đổi trạng thái sức khỏe trực tiếp và lịch sử trạng thái sức khỏe.
 */
@Module({
  imports: [HorsesSharedModule, MedicalSharedModule],
  controllers: [HealthStatusesController],
  providers: [HealthStatusesService, HealthStatusesRepository],
})
export class HealthStatusesModule {}
