import { Module } from '@nestjs/common';
import { GroomAssignmentsController } from './groom-assignments.controller';
import { GroomAssignmentsService } from './groom-assignments.service';

@Module({
  controllers: [GroomAssignmentsController],
  providers: [GroomAssignmentsService],
})
export class GroomAssignmentsModule {}
