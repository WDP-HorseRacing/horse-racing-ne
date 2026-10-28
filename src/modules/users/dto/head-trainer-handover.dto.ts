import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class HeadTrainerHandoverDto {
  @ApiProperty({ format: 'uuid', description: 'Head Trainer nhận bàn giao' })
  @IsUUID()
  toHeadTrainerId!: string;
}

export class HeadTrainerHandoverResultDto {
  @ApiProperty({ description: 'Số khu chuồng đã chuyển' })
  barnsMoved!: number;

  @ApiProperty({ description: 'Số giáo án đã chuyển' })
  plansMoved!: number;

  @ApiProperty({ description: 'Số lớp nháp hoặc đang chạy đã chuyển' })
  classesMoved!: number;
}
