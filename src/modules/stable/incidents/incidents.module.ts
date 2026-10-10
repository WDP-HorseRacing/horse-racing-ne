import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MediaModule } from '../../media/media.module';
import { ExamRequestsModule } from '../../medical/exam-requests/exam-requests.module';
import { IncidentEntity } from '../entities/incident.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { IncidentRemindersService } from './incident-reminders.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncidentEntity]),
    HorsesSharedModule,
    StableSharedModule,
    MediaModule,
    ExamRequestsModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentRemindersService],
})
export class IncidentsModule {}
