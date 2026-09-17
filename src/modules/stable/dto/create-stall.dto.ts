import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStallDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  barnId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  code!: string;
}
