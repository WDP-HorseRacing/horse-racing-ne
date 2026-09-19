import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorseEntity } from '../entities/horse.entity';
import { HorseAccessService } from './horse-access.service';
import { HorseOwnersService } from './horse-owners.service';
import { HorsesSharedRepository } from './horses-shared.repository';

@Module({
  imports: [TypeOrmModule.forFeature([HorseEntity])],
  providers: [HorsesSharedRepository, HorseAccessService, HorseOwnersService],
  exports: [HorsesSharedRepository, HorseAccessService, HorseOwnersService],
})
export class HorsesSharedModule {}
