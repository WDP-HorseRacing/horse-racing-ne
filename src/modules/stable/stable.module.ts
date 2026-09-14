import { Module } from '@nestjs/common';
import { StableController } from './controllers/stable.controller';

@Module({ controllers: [StableController] })
export class StableModule {}
