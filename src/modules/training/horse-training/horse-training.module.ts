import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { HorseTrainingController } from './horse-training.controller';
import { HorseTrainingRepository } from './horse-training.repository';
import { HorseTrainingService } from './horse-training.service';

@Module({
  imports: [HorsesSharedModule],
  controllers: [HorseTrainingController],
  providers: [HorseTrainingRepository, HorseTrainingService],
})
export class HorseTrainingModule {}
