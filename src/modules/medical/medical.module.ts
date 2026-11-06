import { Module } from '@nestjs/common';
import { CareSchedulesModule } from './care-schedule/care-schedules.module';
import { ExamRequestsModule } from './exam-request/exam-requests.module';
import { HealthStatusesModule } from './health-status/health-statuses.module';
import { InjuryCasesModule } from './injury-case/injury-cases.module';
import { MedicalDashboardModule } from './medical-dashboard/medical-dashboard.module';
import { MedicalRecordsModule } from './medical-record/medical-records.module';
import { MedicalRemindersModule } from './medical-reminder/medical-reminders.module';
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
