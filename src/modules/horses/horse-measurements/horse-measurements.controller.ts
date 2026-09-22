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
  HorseMeasurementListQueryDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
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
  measurements(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    return this.measurementsService.listMeasurements(actor, horseId, query);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM])
  @Post('measurements')
  @ApiOperation({ summary: 'Record a horse measurement' })
  @ApiCreatedResponse({ type: CreatedHorseMeasurementResponseDto })
  addMeasurement(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateHorseMeasurementDto,
  ): Promise<CreatedHorseMeasurementResponseDto> {
    return this.measurementsService.addMeasurement(actor, horseId, body);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM])
  @Delete('measurements/:measurementId')
  @ApiOperation({
    summary: 'Soft-delete a horse measurement recorded by the caller',
  })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMeasurement(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Param('measurementId', ParseUUIDPipe) measurementId: string,
  ): Promise<void> {
    return this.measurementsService.deleteMeasurement(
      actor,
      horseId,
      measurementId,
    );
  }
}
