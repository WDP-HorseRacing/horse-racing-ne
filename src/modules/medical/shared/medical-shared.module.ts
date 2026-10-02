import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { MedicalAccessService } from './medical-access.service';
import { MedicalCheckupsService } from './medical-checkups.service';
import { MedicalLifecycleService } from './medical-lifecycle.service';

@Module({
  imports: [HorsesSharedModule],
  providers: [
    MedicalAccessService,
    MedicalLifecycleService,
    MedicalCheckupsService,
  ],
  exports: [
    MedicalAccessService,
    MedicalLifecycleService,
    MedicalCheckupsService,
  ],
})
export class MedicalSharedModule {}
