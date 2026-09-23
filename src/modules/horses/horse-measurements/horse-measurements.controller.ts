import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreatedHorseMeasurementResponseDto,
  CreateHorseMeasurementDto,
  DeleteHorseMeasurementDto,
  HorseMeasurementListQueryDto,
  HorseMeasurementResponseDto,
} from '../dto';
import { HorseMeasurementsService } from './horse-measurements.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseMeasurementsController {
  constructor(private readonly measurementsService: HorseMeasurementsService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('measurements')
  @ApiOperation({ summary: 'List horse measurement history' })
  @ApiOkResponse({ type: [HorseMeasurementResponseDto] })
  listMeasurements(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    return this.measurementsService.listMeasurements(actor, horseId, query);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM])
  @Post('measurements')
  @ApiOperation({
    summary: 'Record one measuring session of a horse',
    description:
      'Một hoặc nhiều loại chỉ số trong cùng lần đo. Veterinarian: mọi ngựa; Head Trainer: ngựa thuộc khu mình; Groom: ngựa được phân công. Có giá trị ngoài khoảng bình thường thì phải gửi confirmAbnormal = true, không thì trả 422.',
  })
  @ApiCreatedResponse({ type: [CreatedHorseMeasurementResponseDto] })
  addMeasurements(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateHorseMeasurementDto,
  ): Promise<CreatedHorseMeasurementResponseDto[]> {
    return this.measurementsService.addMeasurements(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Delete('measurements/:measurementId')
  @ApiOperation({
    summary: 'Soft-delete a wrong horse measurement',
    description:
      'Chỉ Veterinarian, bắt buộc nhập lý do. Bản ghi đến từ buổi khám (source MEDICAL_EXAM) trả 409.',
  })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMeasurement(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Param('measurementId', ParseUUIDPipe) measurementId: string,
    @Body() body: DeleteHorseMeasurementDto,
  ): Promise<void> {
    return this.measurementsService.deleteMeasurement(
      actor,
      horseId,
      measurementId,
      body,
    );
  }
}
