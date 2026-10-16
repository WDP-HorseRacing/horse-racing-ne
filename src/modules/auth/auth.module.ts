import { Module } from '@nestjs/common';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';

@Module({
  imports: [KeycloakModule, UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
