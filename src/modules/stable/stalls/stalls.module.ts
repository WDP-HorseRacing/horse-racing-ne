import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { StallEntity } from '../entities/stall.entity';
import { StallsController } from './stalls.controller';
import { StallsService } from './stalls.service';

@Module({
  imports: [TypeOrmModule.forFeature([StallEntity, StallAssignmentEntity])],
  controllers: [StallsController],
  providers: [StallsService],
  exports: [StallsService],
})
export class StallsModule {}
