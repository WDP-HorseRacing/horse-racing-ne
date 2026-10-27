import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { CareTasksController } from './care-tasks.controller';
import { CareTasksService } from './care-tasks.service';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([CareTaskTypeEntity, HorseCareTaskEntity]),
    StableSharedModule,
  ],
  controllers: [CareTasksController],
  providers: [CareTasksService],
})
export class CareTasksModule {}
