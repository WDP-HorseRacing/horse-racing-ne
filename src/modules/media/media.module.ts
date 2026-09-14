import { Module } from '@nestjs/common';
import { MediaController } from './controllers/media.controller';

@Module({ controllers: [MediaController] })
export class MediaModule {}
