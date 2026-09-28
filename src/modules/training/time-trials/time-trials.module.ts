import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrialResultsController } from './trial-results.controller';
import { TrialResultsService } from './trial-results.service';
import { TimeTrialsController } from './time-trials.controller';
import { TimeTrialsService } from './time-trials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeTrialEntity,
      TrialResultEntity,
      SessionParticipantEntity,
      TrainingSessionEntity,
      TrainingPlanEntity,
      TrainingClassEntity,
      MediaAssetEntity,
    ]),
    TrainingSharedModule,
  ],
  controllers: [TimeTrialsController, TrialResultsController],
  providers: [TimeTrialsService, TrialResultsService],
})
export class TimeTrialsModule {}
