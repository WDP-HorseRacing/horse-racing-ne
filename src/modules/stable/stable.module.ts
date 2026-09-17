import { Module } from '@nestjs/common';
import { BarnsController } from './controllers/barns.controller';
import { StableController } from './controllers/stable.controller';
import { StableDetailsController } from './controllers/stable-details.controller';
import { BarnsService } from './services/barns.service';

@Module({
  providers: [BarnsService],
  controllers: [StableController, StableDetailsController, BarnsController],
})
export class StableModule {}
