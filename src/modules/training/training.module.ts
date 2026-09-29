import { Module } from '@nestjs/common';
import { HorseTrainingModule } from './horse-training/horse-training.module';
import { TrainingClassesModule } from './training-classes/training-classes.module';
import { TrainingPlansModule } from './training-plans/training-plans.module';
import { TrainingSessionsModule } from './training-sessions/training-sessions.module';
import { TimeTrialsModule } from './time-trials/time-trials.module';

@Module({
  imports: [
    TrainingClassesModule,
    TrainingPlansModule,
    TrainingSessionsModule,
    TimeTrialsModule,
    HorseTrainingModule,
  ],
})
export class TrainingModule {}
