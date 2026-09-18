import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { UserEntity } from './entities/user.entity';
import { ProvisioningService } from './services/provisioning.service';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), KeycloakModule],
  providers: [ProvisioningService, UsersService],
  controllers: [UsersController],
  exports: [ProvisioningService],
})
export class UsersModule {}
