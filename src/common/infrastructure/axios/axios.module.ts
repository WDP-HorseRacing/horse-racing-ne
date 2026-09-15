import { Global, Module } from '@nestjs/common';
import { AxiosService } from './axios.service';

@Global()
@Module({ providers: [AxiosService], exports: [AxiosService] })
export class AxiosModule {}
