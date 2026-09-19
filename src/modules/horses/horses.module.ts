import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorseDetailsController } from './controllers/horse-details.controller';
import { HorsesController } from './controllers/horses.controller';
import { HorseOwnershipEntity } from './entities/horse-ownership.entity';
import { HorseMeasurementEntity } from './entities/horse-measurement.entity';
import { HorseEntity } from './entities/horse.entity';
import { HorsesRepository } from './repositories/horses.repository';
import { HorsesService } from './services/horses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HorseEntity,
      HorseOwnershipEntity,
      HorseMeasurementEntity,
    ]),
  ],
  providers: [HorsesRepository, HorsesService],
  controllers: [HorsesController, HorseDetailsController],
  exports: [HorsesService],
})
export class HorsesModule {}
