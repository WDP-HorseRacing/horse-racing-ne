import { Module } from '@nestjs/common';
import { SuppliesController } from './controllers/supplies.controller';

@Module({ controllers: [SuppliesController] })
export class SuppliesModule {}
