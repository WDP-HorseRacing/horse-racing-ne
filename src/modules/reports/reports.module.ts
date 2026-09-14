import { Module } from '@nestjs/common';
import { ReportsController } from './controllers/reports.controller';

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
