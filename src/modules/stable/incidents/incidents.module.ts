import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MediaModule } from '../../media/media.module';
import { ExamRequestsModule } from '../../medical/exam-request/exam-requests.module';
import { IncidentEntity } from '../entities/incident.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { IncidentExamRequestListener } from './listeners';
import { IncidentsController } from './controllers';
import { IncidentRemindersService, IncidentsService } from './services';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([IncidentEntity]),
    HorsesSharedModule,
    StableSharedModule,
    MediaModule,
    ExamRequestsModule,
  ],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentRemindersService,
    IncidentExamRequestListener,
  ],
})
export class IncidentsModule {}
