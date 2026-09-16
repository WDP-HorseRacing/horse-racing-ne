import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseGender } from '../constants/horse-gender.enum';
import { HorseParentRole } from '../constants/horse-parent-role.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';

export class HorsePedigreeNodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @ApiProperty()
  isReference!: boolean;

  @ApiProperty({ minimum: 1, maximum: 4 })
  generation!: number;

  @ApiProperty({ enum: HorseParentRole })
  parentRole!: HorseParentRole;

  @ApiProperty({
    format: 'uuid',
    description: 'Ngựa con của node này trong cây',
  })
  childId!: string;
}

export class HorsePedigreeResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ minimum: 1, maximum: 4 })
  depth!: number;

  @ApiProperty({ type: [HorsePedigreeNodeResponseDto] })
  ancestors!: HorsePedigreeNodeResponseDto[];
}
