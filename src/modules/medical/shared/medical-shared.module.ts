import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalAccessService } from './access';
import { MedicalLifecycleService } from './lifecycle';
import { MedicalCheckupsService } from './queries';
import {
  CareScheduleWritesService,
  ExamRequestWritesService,
  TrainingLockWritesService,
} from './writes';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    MedicalAccessService,
    MedicalLifecycleService,
    MedicalCheckupsService,
    TrainingLockWritesService,
    CareScheduleWritesService,
    ExamRequestWritesService,
  ],
  exports: [
    MedicalAccessService,
    MedicalLifecycleService,
    MedicalCheckupsService,
    TrainingLockWritesService,
    CareScheduleWritesService,
    ExamRequestWritesService,
  ],
})
export class MedicalSharedModule {}
