import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ReleaseTrainingLockDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  conclusion!: string;
}
