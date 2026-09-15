import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakModule } from '../../common/integration/keycloak/keycloak.module';
import { UserEntity } from './entities/user.entity';
import { ClubEntity } from './entities/club.entity';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';
import { ClubsController } from './clubs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ClubEntity]), KeycloakModule],
  providers: [UsersRepository, UsersService],
  controllers: [UsersController, ClubsController],
  // AuthModule dung UsersRepository cho luong dang ky.
  exports: [UsersRepository],
})
export class UsersModule {}
