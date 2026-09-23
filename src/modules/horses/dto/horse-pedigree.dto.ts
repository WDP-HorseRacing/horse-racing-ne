import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseGender } from '../enums/horse-gender.enum';
import { HorseParentRole } from '../enums/horse-parent-role.enum';
import { RaceAptitude } from '../enums/race-aptitude.enum';

export class HorsePedigreeNodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    enum: HorseGender,
    nullable: true,
    description: 'Không có key khi canOpen = false',
  })
  gender?: HorseGender | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Không có key khi canOpen = false',
  })
  breed?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Không có key khi canOpen = false',
  })
  color?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Không có key khi canOpen = false',
  })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({
    enum: RaceAptitude,
    nullable: true,
    description: 'Không có key khi canOpen = false',
  })
  raceAptitude?: RaceAptitude | null;

  @ApiProperty({
    description:
      'Người gọi mở được hồ sơ tổ tiên này không. Horse Owner chỉ mở được ngựa mình sở hữu, còn lại chỉ thấy tên',
  })
  canOpen!: boolean;

  @ApiProperty({ minimum: 1, maximum: 2 })
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

  @ApiProperty({
    minimum: 2,
    maximum: 2,
    description: 'Luôn 2 đời tổ tiên: cha mẹ và ông bà',
  })
  depth!: number;

  @ApiProperty({ type: [HorsePedigreeNodeResponseDto] })
  ancestors!: HorsePedigreeNodeResponseDto[];
}
