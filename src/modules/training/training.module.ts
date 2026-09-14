import { Module } from '@nestjs/common';
import { TrainingController } from './controllers/training.controller';
import { TrainingDetailsController } from './controllers/training-details.controller';

@Module({ controllers: [TrainingController, TrainingDetailsController] })
export class TrainingModule {}
