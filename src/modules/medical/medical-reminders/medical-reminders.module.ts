import { Module } from '@nestjs/common';
import { MedicalSharedModule } from '../shared/medical-shared.module';
import { MedicalRemindersService } from './medical-reminders.service';

/**
 * Chạy job nhắc nhở y tế hằng ngày: ngựa quá hạn khám định kỳ và lịch chăm sóc đến hạn.
 */
@Module({
  imports: [MedicalSharedModule],
  providers: [MedicalRemindersService],
})
export class MedicalRemindersModule {}
