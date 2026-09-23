import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { GroomAssignmentsController } from './groom-assignments.controller';
import { GroomAssignmentsService } from './groom-assignments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroomAssignmentEntity]),
    AuditModule,
    HorsesSharedModule,
    StableSharedModule,
  ],
  controllers: [GroomAssignmentsController],
  providers: [GroomAssignmentsService],
  exports: [GroomAssignmentsService],
})
export class GroomAssignmentsModule {}
