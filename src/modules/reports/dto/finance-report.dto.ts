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
  @ApiProperty({ description: 'Số buổi khám chưa hủy trong kỳ' })
  visitCount!: number;
  @ApiProperty({ description: 'Chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Phụ phí chăm sóc riêng (VND)' })
  surcharge!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế + phụ phí (VND)' })
  total!: number;
}

export class OwnerCostResponseDto {
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ description: 'Tổng phí nuôi theo ngày (VND)' })
  dailyFee!: number;
  @ApiProperty({ description: 'Tổng chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Tổng phụ phí chăm sóc riêng (VND)' })
  surcharge!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế + phụ phí (VND)' })
  total!: number;
  @ApiProperty({ description: 'Tiền thưởng giải đấu (VND), luôn 0' })
  prizeMoney!: number;
  @ApiProperty({
    type: [OwnerCostHorseDto],
    description:
      'Các ngựa còn ở CLB dưới tên chủ ít nhất một ngày trong kỳ, sắp theo tên',
  })
  horses!: OwnerCostHorseDto[];
}

export class FinanceOwnerChargesDto {
  @ApiProperty({ description: 'Phí nuôi theo ngày (VND)' }) dailyFee!: number;
  @ApiProperty({ description: 'Chi phí y tế (VND)' }) medicalCost!: number;
  @ApiProperty({ description: 'Phụ phí chăm sóc riêng (VND)' })
  surcharge!: number;
  @ApiProperty({ description: 'Phí nuôi + chi phí y tế + phụ phí (VND)' })
  total!: number;
}

export class FinanceSuppliesDto {
  @ApiProperty({ description: 'Giá trị vật tư nhập vào (VND)' })
  purchased!: number;
  @ApiProperty({ description: 'Giá trị vật tư đã xuất dùng (VND)' })
  used!: number;
  @ApiProperty({
    description:
      'Giá trị tồn kho lúc hết ngày cuối kỳ (VND): cộng tiền các dòng sổ tới hết ngày cuối kỳ (tồn ban đầu, nhập hàng, xuất dùng), bỏ các lần xuất đã hủy; gồm cả vật tư đã xóa',
  })
  inventoryValue!: number;
}

export class FinanceOwnerDto extends FinanceOwnerChargesDto {
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
}

export class FinanceUnownedDto extends FinanceOwnerChargesDto {
  @ApiProperty({
    description:
      'Tổng số ngày tính phí của các ngựa ở CLB mà lúc hết ngày không có chủ (mỗi ngựa mỗi ngày tính một)',
  })
  billedDays!: number;
}

export class ClubFinanceResponseDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({
    type: FinanceOwnerChargesDto,
    description:
      'Tổng phí nuôi, chi phí y tế và phụ phí của mọi ngựa trong kỳ, gồm cả phần chưa có chủ (= tổng owners + unowned)',
  })
  ownerCharges!: FinanceOwnerChargesDto;
  @ApiProperty({ type: FinanceSuppliesDto }) supplies!: FinanceSuppliesDto;
  @ApiProperty({ description: 'Tiền thưởng giải đấu (VND), luôn 0' })
  prizeMoney!: number;
  @ApiProperty({
    type: [FinanceOwnerDto],
    description:
      'Từng chủ có ngựa còn ở CLB hoặc có buổi khám trong kỳ, sắp theo tên',
  })
  owners!: FinanceOwnerDto[];
  @ApiProperty({
    type: FinanceUnownedDto,
    description:
      'Phần chưa có chủ: phí nuôi, phụ phí của các ngày ngựa ở CLB không có chủ và chi phí các buổi khám (theo ngày khám) lúc ngựa không có chủ; không có thì các số bằng 0',
  })
  unowned!: FinanceUnownedDto;
}
