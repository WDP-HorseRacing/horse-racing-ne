import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { GroomAssignmentResponseDto } from '../../stable/dto/groom-assignment.dto';
import { StallAssignmentResponseDto } from '../../stable/dto/stall.dto';

export class AssignHorseBarnDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Khu chuồng mới. Phải đang hoạt động, có Head Trainer phụ trách và còn ô trống',
  })
  @IsUUID()
  barnId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do xếp hoặc đổi khu, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class PlaceHorseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Ô chuồng đích, phải thuộc khu của ngựa và đang trống',
  })
  @IsUUID()
  stallId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Groom phụ trách, phải là tài khoản GROOM đang hoạt động',
  })
  @IsUUID()
  groomId!: string;
}

export class HorsePlacementResponseDto {
  @ApiProperty({ type: StallAssignmentResponseDto })
  stallAssignment!: StallAssignmentResponseDto;

  @ApiProperty({ type: GroomAssignmentResponseDto })
  groomAssignment!: GroomAssignmentResponseDto;
}
