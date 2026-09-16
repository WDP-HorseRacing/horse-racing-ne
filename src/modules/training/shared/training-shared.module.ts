import { Module } from '@nestjs/common';
import { TrainingAccessService } from './training-access.service';

@Module({
  providers: [TrainingAccessService],
  exports: [TrainingAccessService],
})
export class TrainingSharedModule {}
