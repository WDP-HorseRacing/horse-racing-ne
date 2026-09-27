import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryCasesController } from './injury-cases.controller';
import { InjuryCasesService } from './injury-cases.service';

/**
 * Owns the read-only injury timeline of a horse (F3.10). Injury markers are written by medical-records.
 */
@Module({
  imports: [HorsesSharedModule],
  controllers: [InjuryCasesController],
  providers: [InjuryCasesService],
})
export class InjuryCasesModule {}
