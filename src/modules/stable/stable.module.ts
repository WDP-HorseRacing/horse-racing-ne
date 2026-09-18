import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarnsController } from './controllers/barns.controller';
import { StableController } from './controllers/stable.controller';
import { StableDetailsController } from './controllers/stable-details.controller';
import { BarnEntity } from './entities/barn.entity';
import { StallAssignmentEntity } from './entities/stall-assignment.entity';
import { StallEntity } from './entities/stall.entity';
import { BarnsService } from './services/barns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BarnEntity, StallEntity, StallAssignmentEntity]),
  ],
  providers: [BarnsService],
  controllers: [StableController, StableDetailsController, BarnsController],
})
export class StableModule {}
