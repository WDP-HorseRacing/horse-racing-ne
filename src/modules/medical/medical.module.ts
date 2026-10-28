import { Module } from '@nestjs/common';
import { CareSchedulesModule } from './care-schedules/care-schedules.module';
import { ExamRequestsModule } from './exam-requests/exam-requests.module';
import { HealthStatusesModule } from './health-statuses/health-statuses.module';
import { InjuryCasesModule } from './injury-cases/injury-cases.module';
import { MedicalDashboardModule } from './medical-dashboard/medical-dashboard.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { MedicalRemindersModule } from './medical-reminders/medical-reminders.module';
import { TrainingLocksModule } from './training-locks/training-locks.module';

@Module({
  imports: [
    MedicalRecordsModule,
    InjuryCasesModule,
    TrainingLocksModule,
    CareSchedulesModule,
    ExamRequestsModule,
    HealthStatusesModule,
    MedicalDashboardModule,
    MedicalRemindersModule,
  ],
})
export class MedicalModule {}
