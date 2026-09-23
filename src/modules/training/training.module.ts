import { Module } from '@nestjs/common';
import { EvaluationsModule } from './trainging-evaluations/training-evaluations.module';
import { TrainingPlansModule } from './training-plans/training-plans.module';
import { TrainingSessionsModule } from './training-sessions/training-sessions.module';
import { TimeTrialsModule } from './time-trials/time-trials.module';

@Module({
  imports: [
    TrainingPlansModule,
    TrainingSessionsModule,
    TimeTrialsModule,
    EvaluationsModule,
  ],
})
export class TrainingModule {}
