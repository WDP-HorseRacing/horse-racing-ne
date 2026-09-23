import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { TrainingAccessService } from './training-access.service';

@Module({
  imports: [HorsesSharedModule],
  providers: [TrainingAccessService],
  exports: [TrainingAccessService],
})
export class TrainingSharedModule {}
