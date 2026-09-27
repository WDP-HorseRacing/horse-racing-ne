import { Module } from '@nestjs/common';
import { CareSchedulesModule } from './care-schedules/care-schedules.module';
import { InjuryCasesModule } from './injury-cases/injury-cases.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { TrainingLocksModule } from './training-locks/training-locks.module';

@Module({
  imports: [
    MedicalRecordsModule,
    InjuryCasesModule,
    TrainingLocksModule,
    CareSchedulesModule,
  ],
})
export class MedicalModule {}
