import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorseEntity } from './entities/horse.entity';
import { HorsesRepository } from './repositories/horses.repository';
import { HorsesService } from './services/horses.service';
import { HorsesController } from './controllers/horses.controller';
import { HorseDetailsController } from './controllers/horse-details.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HorseEntity])],
  providers: [HorsesRepository, HorsesService],
  controllers: [HorsesController, HorseDetailsController],
  exports: [HorsesService],
})
export class HorsesModule {}
