import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { MediaModule } from '../../media/media.module';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { ParticipantEligibilityListener } from './participant-eligibility.listener';
import { SessionAutoCloseService } from './session-auto-close.service';
import { SessionParticipantsController } from './session-participants.controller';
import { SessionParticipantsService } from './session-participants.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrainingSessionEntity,
      TrainingClassEntity,
      HorseEnrollmentEntity,
      SessionParticipantEntity,
      TrainingLockEntity,
      GroomAssignmentEntity,
      HorseEntity,
    ]),
    TrainingSharedModule,
    MediaModule,
  ],
  controllers: [TrainingSessionsController, SessionParticipantsController],
  providers: [
    TrainingSessionsService,
    SessionParticipantsService,
    ParticipantEligibilityListener,
    SessionAutoCloseService,
  ],
})
export class TrainingSessionsModule {}
