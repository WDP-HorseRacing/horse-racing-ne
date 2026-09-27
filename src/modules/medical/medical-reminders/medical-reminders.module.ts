import { Module } from '@nestjs/common';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalRemindersService } from './medical-reminders.service';

/**
 * Owns the daily medical reminder job (F3.2 overdue checkups, F3.11 due care schedules).
 */
@Module({
  imports: [MedicalSharedModule],
  providers: [MedicalRemindersService],
})
export class MedicalRemindersModule {}
