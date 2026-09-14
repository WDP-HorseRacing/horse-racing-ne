import { Module } from '@nestjs/common';
import { StableController } from './controllers/stable.controller';
import { StableDetailsController } from './controllers/stable-details.controller';

@Module({ controllers: [StableController, StableDetailsController] })
export class StableModule {}
