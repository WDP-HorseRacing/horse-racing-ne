import { Module } from '@nestjs/common';
import { PerformanceAccessService } from './performance-access.service';

/**
 * Cung cấp các câu đọc dùng chung cho các feature của domain hiệu suất
 */
@Module({
  providers: [PerformanceAccessService],
  exports: [PerformanceAccessService],
})
export class PerformanceSharedModule {}
