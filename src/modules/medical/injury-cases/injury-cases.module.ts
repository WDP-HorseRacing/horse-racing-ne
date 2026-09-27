import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { InjuryCaseDetailsController } from './injury-case-details.controller';
import { InjuryCasesController } from './injury-cases.controller';
import { InjuryCasesService } from './injury-cases.service';

@Module({
  imports: [TypeOrmModule.forFeature([InjuryMarkerEntity]), HorsesSharedModule],
  controllers: [InjuryCasesController, InjuryCaseDetailsController],
  providers: [InjuryCasesService],
})
export class InjuryCasesModule {}
