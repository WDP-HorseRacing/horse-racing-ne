import { Module } from '@nestjs/common';
import { HorseAccessService } from './horse-access.service';
import { HorsePedigreeRepository } from './horse-pedigree.repository';
import { HorsePedigreeService } from './horse-pedigree.service';
import { HorsesSharedRepository } from './horses-shared.repository';

@Module({
  providers: [
    HorsesSharedRepository,
    HorseAccessService,
    HorsePedigreeRepository,
    HorsePedigreeService,
  ],
  exports: [HorsesSharedRepository, HorseAccessService, HorsePedigreeService],
})
export class HorsesSharedModule {}
