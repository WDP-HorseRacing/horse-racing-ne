import { ApiProperty } from '@nestjs/swagger';

export class HorseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}
