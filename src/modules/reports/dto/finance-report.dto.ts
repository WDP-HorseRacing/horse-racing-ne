import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { ReportPeriodDto } from './report-period.dto';

export class OwnerCostQueryDto extends ReportPeriodDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chủ cần xem; Club Manager bắt buộc truyền, Horse Owner luôn xem của chính mình',
  })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}

export class OwnerCostHorseDto {
  @ApiProperty({ format: 'uuid' }) horseId!: string;
  @ApiProperty() horseName!: string;
  @ApiProperty({ description: 'Số ngày tính phí nuôi' }) billedDays!: number;
  @ApiProperty({ description: 'Phí nuôi theo ngày (VND)' }) dailyFee!: number;
  @ApiProperty({ description: 'Số bệnh án đóng trong kỳ' }) caseCount!: number;
  @ApiProperty({ description: 'Chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế (VND)' }) total!: number;
}

export class OwnerCostResponseDto {
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ description: 'Tổng phí nuôi theo ngày (VND)' })
  dailyFee!: number;
  @ApiProperty({ description: 'Tổng chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế (VND)' }) total!: number;
  @ApiProperty({ description: 'Tiền thưởng giải đấu (VND), luôn 0' })
  prizeMoney!: number;
  @ApiProperty({
    type: [OwnerCostHorseDto],
    description: 'Các ngựa chủ sở hữu trong kỳ, sắp theo tên',
  })
  horses!: OwnerCostHorseDto[];
}

export class FinanceOwnerChargesDto {
  @ApiProperty({ description: 'Phí nuôi theo ngày (VND)' }) dailyFee!: number;
  @ApiProperty({ description: 'Chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế (VND)' }) total!: number;
}

export class FinanceSuppliesDto {
  @ApiProperty({ description: 'Giá trị vật tư nhập vào (VND)' })
  purchased!: number;
  @ApiProperty({ description: 'Giá trị vật tư đã xuất dùng (VND)' })
  used!: number;
}

export class FinanceOwnerDto extends FinanceOwnerChargesDto {
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
}

export class ClubFinanceResponseDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({
    type: FinanceOwnerChargesDto,
    description:
      'Khoản thu từ chủ ngựa; chi phí y tế gồm cả bệnh án đóng lúc ngựa không có chủ',
  })
  ownerCharges!: FinanceOwnerChargesDto;
  @ApiProperty({ type: FinanceSuppliesDto }) supplies!: FinanceSuppliesDto;
  @ApiProperty({ description: 'Tiền thưởng giải đấu (VND), luôn 0' })
  prizeMoney!: number;
  @ApiProperty({
    type: [FinanceOwnerDto],
    description: 'Từng chủ có ngựa trong kỳ, sắp theo tên',
  })
  owners!: FinanceOwnerDto[];
}
