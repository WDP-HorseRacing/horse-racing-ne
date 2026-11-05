import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { MediaModule } from '../../media/media.module';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrialResultsController } from './trial-results.controller';
import { TrialResultsService } from './trial-results.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrialResultEntity,
      SessionParticipantEntity,
      TrainingSessionEntity,
      TrainingClassEntity,
    ]),
    TrainingSharedModule,
    AuditModule,
    MediaModule,
  ],
  controllers: [TrialResultsController],
  providers: [TrialResultsService],
})
export class TimeTrialsModule {}
