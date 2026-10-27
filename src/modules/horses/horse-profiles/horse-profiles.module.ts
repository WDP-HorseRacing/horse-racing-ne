import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { MediaModule } from '../../media/media.module';
import { BarnsModule } from '../../stable/barns/barns.module';
import { HorseEntity } from '../entities/horse.entity';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseProfilesController } from './horse-profiles.controller';
import { HorseProfilesRepository } from './horse-profiles.repository';
import { HorseProfilesService } from './horse-profiles.service';
import { PastHorsesController } from './past-horses.controller';
import { PastHorsesService } from './past-horses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseEntity]),
    HorsesSharedModule,
    AuditModule,
    MediaModule,
    BarnsModule,
  ],
  controllers: [HorseProfilesController, PastHorsesController],
  providers: [HorseProfilesRepository, HorseProfilesService, PastHorsesService],
})
export class HorseProfilesModule {}
