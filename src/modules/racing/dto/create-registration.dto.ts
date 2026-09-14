import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;
}
