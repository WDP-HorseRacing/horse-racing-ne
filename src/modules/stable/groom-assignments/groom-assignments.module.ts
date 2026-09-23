import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { GroomAssignmentsController } from './groom-assignments.controller';
import { GroomAssignmentsService } from './groom-assignments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroomAssignmentEntity, HorseEntity, UserEntity]),
  ],
  controllers: [GroomAssignmentsController],
  providers: [GroomAssignmentsService],
})
export class GroomAssignmentsModule {}
