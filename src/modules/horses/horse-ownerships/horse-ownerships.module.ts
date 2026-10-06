import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { MedicalSharedModule } from '../../medical/shared/medical-shared.module';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseOwnershipsController } from './horse-ownerships.controller';
import { HorseOwnershipsService } from './horse-ownerships.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HorseOwnershipEntity]),
    HorsesSharedModule,
    AuditModule,
    MedicalSharedModule,
  ],
  controllers: [HorseOwnershipsController],
  providers: [HorseOwnershipsService],
})
export class HorseOwnershipsModule {}
