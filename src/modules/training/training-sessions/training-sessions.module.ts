import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsRepository } from './training-sessions.repository';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingSessionEntity]),
    TrainingSharedModule,
  ],
  controllers: [TrainingSessionsController],
  providers: [TrainingSessionsRepository, TrainingSessionsService],
  exports: [TrainingSessionsService],
})
export class TrainingSessionsModule {}
