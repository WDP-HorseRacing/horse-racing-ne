import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalAccessService } from './medical-access.service';
import { MedicalCheckupsService } from './medical-checkups.service';
import { MedicalLifecycleService } from './medical-lifecycle.service';
import { MedicalSharedRepository } from './medical-shared.repository';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    MedicalAccessService,
    MedicalSharedRepository,
    MedicalLifecycleService,
    MedicalCheckupsService,
  ],
  exports: [
    MedicalAccessService,
    MedicalSharedRepository,
    MedicalLifecycleService,
    MedicalCheckupsService,
  ],
})
export class MedicalSharedModule {}
