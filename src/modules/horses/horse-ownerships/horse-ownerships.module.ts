import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseOwnershipsController } from './horse-ownerships.controller';
import { HorseOwnershipsRepository } from './horse-ownerships.repository';
import { HorseOwnershipsService } from './horse-ownerships.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseEntity, HorseOwnershipEntity]),
    HorsesSharedModule,
  ],
  controllers: [HorseOwnershipsController],
  providers: [HorseOwnershipsRepository, HorseOwnershipsService],
})
export class HorseOwnershipsModule {}
