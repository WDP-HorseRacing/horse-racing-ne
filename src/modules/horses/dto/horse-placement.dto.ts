import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
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

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 500,
    description:
      'Lý do đổi khu. Bắt buộc khi ngựa đã có khu; xếp khu lần đầu thì bỏ trống được',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
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

export class BarnPreviewQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Khu muốn chuyển sang' })
  @IsUUID()
  barnId!: string;
}

export class HorseBarnPreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ description: 'false nếu không đổi được' })
  allowed!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do không đổi được, null nếu allowed = true',
  })
  blockedReason!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  fromBarnName!: string | null;

  @ApiProperty()
  toBarnName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  newHeadTrainerName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Mã ô sẽ được trả về trống, null nếu ngựa chưa có ô',
  })
  stallReleased!: string | null;

  @ApiProperty({ description: 'Số lớp ngựa sẽ bị rút' })
  classesWithdrawn!: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Groom giữ nguyên sau khi đổi khu, null nếu chưa có Groom',
  })
  groomKept!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Câu tóm tắt hệ quả, null nếu allowed = false',
  })
  summary!: string | null;
}
