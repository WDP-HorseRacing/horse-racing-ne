import { Module } from '@nestjs/common';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { AuditModule } from '../audit/audit.module';
import { UserDevicesModule } from '../notifications/user-devices/user-devices.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';

@Module({
  imports: [KeycloakModule, UsersModule, AuditModule, UserDevicesModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
