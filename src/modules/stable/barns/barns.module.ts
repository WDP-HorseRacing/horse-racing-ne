import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { BarnEntity } from '../entities/barn.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { BarnsController } from './barns.controller';
import { BarnsService } from './barns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BarnEntity]),
    StableSharedModule,
    AuditModule,
  ],
  controllers: [BarnsController],
  providers: [BarnsService],
  exports: [BarnsService],
})
export class BarnsModule {}
