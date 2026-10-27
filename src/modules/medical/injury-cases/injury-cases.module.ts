import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { InjuryCasesController } from './injury-cases.controller';
import { InjuryCasesService } from './injury-cases.service';

/**
 * Cung cấp diễn biến chấn thương của con ngựa, chỉ đọc.
 */
@Module({
  imports: [HorsesSharedModule],
  controllers: [InjuryCasesController],
  providers: [InjuryCasesService],
})
export class InjuryCasesModule {}
