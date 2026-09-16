import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TimeTrialsController } from './time-trials.controller';
import { TimeTrialsRepository } from './time-trials.repository';
import { TimeTrialsService } from './time-trials.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeTrialEntity]), TrainingSharedModule],
  controllers: [TimeTrialsController],
  providers: [TimeTrialsRepository, TimeTrialsService],
  exports: [TimeTrialsService],
})
export class TimeTrialsModule {}
