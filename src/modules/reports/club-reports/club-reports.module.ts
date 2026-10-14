import { Module } from '@nestjs/common';
import { ClubReportsController } from './club-reports.controller';

@Module({ controllers: [ClubReportsController] })
export class ClubReportsModule {}
