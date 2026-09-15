import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakModule } from '../../common/integration/keycloak/keycloak.module';
import { UserEntity } from './entities/user.entity';
import { ClubEntity } from './entities/club.entity';
import { UsersRepository } from './repositories/users.repository';
import { ProvisioningService } from './services/provisioning.service';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';
import { ClubsController } from './clubs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ClubEntity]), KeycloakModule],
  providers: [UsersRepository, ProvisioningService, UsersService],
  controllers: [UsersController, ClubsController],
  exports: [UsersRepository, ProvisioningService],
})
export class UsersModule {}
