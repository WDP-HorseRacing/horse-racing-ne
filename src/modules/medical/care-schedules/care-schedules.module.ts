import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { CareSchedulesController } from './care-schedules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CareScheduleEntity])],
  controllers: [CareSchedulesController],
})
export class CareSchedulesModule {}
