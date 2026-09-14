import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller';

@Module({ controllers: [AuditController] })
export class AuditModule {}
