import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { CareTasksController } from './care-tasks.controller';
import { CareTasksService } from './care-tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CareTaskTypeEntity, HorseCareTaskEntity]),
    StableSharedModule,
  ],
  controllers: [CareTasksController],
  providers: [CareTasksService],
})
export class CareTasksModule {}
