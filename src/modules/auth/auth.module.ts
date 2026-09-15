import { Module } from '@nestjs/common';
import { KeycloakModule } from '../../common/integration/keycloak/keycloak.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';

@Module({
  imports: [KeycloakModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
