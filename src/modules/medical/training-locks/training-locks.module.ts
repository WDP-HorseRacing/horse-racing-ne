import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { TrainingLocksController } from './training-locks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TrainingLockEntity])],
  controllers: [TrainingLocksController],
})
export class TrainingLocksModule {}
