import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { ClubsController } from './clubs.controller';

@Module({ controllers: [UsersController, ClubsController] })
export class UsersModule {}
