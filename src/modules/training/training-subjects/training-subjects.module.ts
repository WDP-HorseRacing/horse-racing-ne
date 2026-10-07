import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrainingSubjectsController } from './training-subjects.controller';
import { TrainingSubjectsService } from './training-subjects.service';

/**
 * Lắp ráp danh mục môn học
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingSubjectEntity]),
    TrainingSharedModule,
  ],
  controllers: [TrainingSubjectsController],
  providers: [TrainingSubjectsService],
})
export class TrainingSubjectsModule {}
