import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarnEntity } from '../entities/barn.entity';
import { BarnsController } from './barns.controller';
import { BarnsService } from './barns.service';

@Module({
  imports: [TypeOrmModule.forFeature([BarnEntity])],
  controllers: [BarnsController],
  providers: [BarnsService],
})
export class BarnsModule {}
