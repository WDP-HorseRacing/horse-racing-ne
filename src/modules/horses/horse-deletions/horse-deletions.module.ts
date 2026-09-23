import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { BarnsModule } from '../../stable/barns/barns.module';
import { HorsesSharedModule } from '../shared/horses-shared.module';
import { HorseDeletionsController } from './horse-deletions.controller';
import { HorseDeletionsRepository } from './horse-deletions.repository';
import { HorseDeletionsService } from './horse-deletions.service';

@Module({
  imports: [HorsesSharedModule, AuditModule, BarnsModule],
  controllers: [HorseDeletionsController],
  providers: [HorseDeletionsRepository, HorseDeletionsService],
})
export class HorseDeletionsModule {}
