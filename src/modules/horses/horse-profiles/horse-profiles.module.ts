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

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseEntity]),
    HorsesSharedModule,
    AuditModule,
    MediaModule,
    BarnsModule,
  ],
  controllers: [HorseProfilesController],
  providers: [HorseProfilesRepository, HorseProfilesService],
})
export class HorseProfilesModule {}
