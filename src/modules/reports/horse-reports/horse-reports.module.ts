import { Module } from '@nestjs/common';
import { HorseReportsController } from './horse-reports.controller';

@Module({ controllers: [HorseReportsController] })
export class HorseReportsModule {}
