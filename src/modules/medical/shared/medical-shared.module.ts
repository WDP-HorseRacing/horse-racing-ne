import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { CareScheduleWritesService } from './care-schedule-writes.service';
import { ExamRequestWritesService } from './exam-request-writes.service';
import { MedicalAccessService } from './medical-access.service';
import { MedicalCheckupsService } from './medical-checkups.service';
import { MedicalLifecycleService } from './medical-lifecycle.service';
import { TrainingLockWritesService } from './training-lock-writes.service';

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
