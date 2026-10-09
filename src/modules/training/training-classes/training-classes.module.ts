import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaModule } from '../../media/media.module';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import {
  TrainingClassEnrollmentsService,
  TrainingClassesService,
} from './services';
import { TrainingClassesController } from './training-classes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingClassEntity, HorseEnrollmentEntity]),
    TrainingSharedModule,
    MediaModule,
  ],
  controllers: [TrainingClassesController],
  providers: [TrainingClassesService, TrainingClassEnrollmentsService],
  exports: [TrainingClassesService, TrainingClassEnrollmentsService],
})
export class TrainingClassesModule {}
