import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { TrainingAccessService } from './training-access.service';
import { TrainingOperationsFacade } from './training-operations.facade';

@Module({
  imports: [HorsesSharedModule],
  providers: [TrainingAccessService, TrainingOperationsFacade],
  exports: [TrainingAccessService, TrainingOperationsFacade],
})
export class TrainingSharedModule {}
