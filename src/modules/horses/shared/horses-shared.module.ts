import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { HorseHealthService } from './horse-health.service';
import { HorseAccessService } from './horse-access.service';
import { HorsePedigreeRepository } from './horse-pedigree.repository';
import { HorsePedigreeService } from './horse-pedigree.service';

@Module({
  imports: [AuditModule],
  providers: [
    HorseHealthService,
    HorseAccessService,
    HorsePedigreeRepository,
    HorsePedigreeService,
  ],
  exports: [HorseAccessService, HorsePedigreeService, HorseHealthService],
})
export class HorsesSharedModule {}
