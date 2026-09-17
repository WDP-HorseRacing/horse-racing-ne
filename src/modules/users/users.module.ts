import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakModule } from '../../common/infrastructure/keycloak/keycloak.module';
import { UserEntity } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { ProvisioningService } from './services/provisioning.service';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), KeycloakModule],
  providers: [UsersRepository, ProvisioningService, UsersService],
  controllers: [UsersController],
  exports: [UsersRepository, ProvisioningService],
})
export class UsersModule {}
