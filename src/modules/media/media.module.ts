import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaController } from './controllers/media.controller';
import { MediaAssetEntity } from './entities/media-asset.entity';
import { MediaService } from './services/media.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAssetEntity])],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
