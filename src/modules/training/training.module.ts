import { Module } from '@nestjs/common';
import { HorseTrainingModule } from './horse-training/horse-training.module';
import { TrainingClassesModule } from './training-class/training-classes.module';
import { TrainingPlansModule } from './training-plan/training-plan.module';
import { TrainingSubjectsModule } from './training-subject/training-subjects.module';
import { TrainingSessionsModule } from './training-session/training-sessions.module';
import { TimeTrialsModule } from './time-trial/time-trials.module';

@Module({
  imports: [
    TrainingClassesModule,
    TrainingPlansModule,
    TrainingSessionsModule,
    TimeTrialsModule,
    HorseTrainingModule,
    TrainingSubjectsModule,
  ],
})
export class TrainingModule {}
