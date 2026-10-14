import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { DailyFeeEntity } from '../entities/daily-fee.entity';
import { DailyFeesController } from './daily-fees.controller';
import { DailyFeesService } from './daily-fees.service';

@Module({
  imports: [TypeOrmModule.forFeature([DailyFeeEntity]), AuditModule],
  controllers: [DailyFeesController],
  providers: [DailyFeesService],
})
export class DailyFeesModule {}
