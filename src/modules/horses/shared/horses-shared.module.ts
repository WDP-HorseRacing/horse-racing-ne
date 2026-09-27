import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { HorseHealthService } from './horse-health.service';
import { HorseAccessService } from './horse-access.service';
import { HorsePedigreeRepository } from './horse-pedigree.repository';
import { HorsePedigreeService } from './horse-pedigree.service';
import { HorsesSharedRepository } from './horses-shared.repository';

@Module({
  imports: [AuditModule],
  providers: [
    HorsesSharedRepository,
    HorseHealthService,
    HorseAccessService,
    HorsePedigreeRepository,
    HorsePedigreeService,
  ],
  exports: [
    HorsesSharedRepository,
    HorseAccessService,
    HorsePedigreeService,
    HorseHealthService,
  ],
})
export class HorsesSharedModule {}
