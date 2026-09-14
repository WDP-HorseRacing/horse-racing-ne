import { Module } from '@nestjs/common';
import { TrainingController } from './controllers/training.controller';

@Module({ controllers: [TrainingController] })
export class TrainingModule {}
