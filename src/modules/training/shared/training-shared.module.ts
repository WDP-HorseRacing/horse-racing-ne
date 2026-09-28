import { Module } from '@nestjs/common';
import { TrainingAccessService } from './training-access.service';
import { TrainingOperationsFacade } from './training-operations.facade';

@Module({
  providers: [TrainingAccessService, TrainingOperationsFacade],
  exports: [TrainingAccessService, TrainingOperationsFacade],
})
export class TrainingSharedModule {}
