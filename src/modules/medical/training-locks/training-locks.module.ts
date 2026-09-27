import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { TrainingLocksController } from './training-locks.controller';
import { TrainingLockService } from './training-locks.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrainingLockEntity])],
  controllers: [TrainingLocksController],
  providers: [TrainingLockService],
  exports: [TrainingLockService],
})
export class TrainingLocksModule {}
