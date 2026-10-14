import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './controllers/audit.controller';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogsService } from './services/audit-logs.service';
import { AuditService } from './services/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditController],
  providers: [AuditService, AuditLogsService],
  exports: [AuditService],
})
export class AuditModule {}
