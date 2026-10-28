import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { StallEntity } from '../entities/stall.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { StallsController } from './stalls.controller';
import { StallsService } from './stalls.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StallEntity, StallAssignmentEntity]),
    AuditModule,
    StableSharedModule,
  ],
  controllers: [StallsController],
  providers: [StallsService],
  exports: [StallsService],
})
export class StallsModule {}
