import { Module } from '@nestjs/common';
import { RacingController } from './controllers/racing.controller';

@Module({ controllers: [RacingController] })
export class RacingModule {}
