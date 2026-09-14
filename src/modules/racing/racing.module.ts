import { Module } from '@nestjs/common';
import { RacingController } from './controllers/racing.controller';
import { RacingDetailsController } from './controllers/racing-details.controller';

@Module({ controllers: [RacingController, RacingDetailsController] })
export class RacingModule {}
