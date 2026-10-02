import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  AdjustCaseCostDto,
  CloseMedicalCaseDto,
  CreateFollowUpVisitDto,
  MedicalCaseClosePreviewResponseDto,
  MedicalCaseDetailResponseDto,
  MedicalCaseListQueryDto,
  MedicalCaseListResponseDto,
  MedicalCaseResponseDto,
  MedicalCostReportQueryDto,
  MedicalCostReportResponseDto,
  MedicalRecordResponseDto,
} from '../dto';
import { MedicalCasesService } from './medical-cases.service';
import { MedicalVisitsService } from './medical-visits.service';
import { MEDICAL_READER_ROLES } from '../constants/medical.constants';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalCasesController {
  constructor(
    private readonly cases: MedicalCasesService,
    private readonly visits: MedicalVisitsService,
  ) {}

  @Access(MEDICAL_READER_ROLES)
  @Get('horses/:horseId/medical-cases')
  @ApiOperation({
    summary: 'List horse medical cases (F3.10)',
    description:
      'Mới nhất lên trên. totalCost là tổng chi phí các bệnh án đã đóng. Head Trainer không có key chi phí; chi phí bệnh án chưa đóng là null.',
  })
  @ApiOkResponse({ type: MedicalCaseListResponseDto })
  listCases(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: MedicalCaseListQueryDto,
  ): Promise<MedicalCaseListResponseDto> {
    return this.cases.listCases(actor, horseId, query);
  }

  @Access(MEDICAL_READER_ROLES)
  @Get('medical-cases/:caseId')
  @ApiOperation({
    summary: 'Get a medical case with its visits (F3.10)',
  })
  @ApiOkResponse({ type: MedicalCaseDetailResponseDto })
  getCase(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<MedicalCaseDetailResponseDto> {
    return this.cases.getCase(actor, caseId);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('medical-cases/:caseId/visits')
  @ApiOperation({
    summary: 'Record a follow-up visit in an open case (F3.6)',
    description:
      'Bệnh án đã đóng: 409. Thời điểm khám không sớm hơn ngày mở bệnh án.',
  })
  @ApiCreatedResponse({ type: MedicalRecordResponseDto })
  addVisit(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: CreateFollowUpVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.visits.createFollowUpVisit(actor, caseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Get('medical-cases/:caseId/close-preview')
  @ApiOperation({
    summary: 'Preview what must be handled before closing a case (F3.9)',
  })
  @ApiOkResponse({ type: MedicalCaseClosePreviewResponseDto })
  closePreview(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<MedicalCaseClosePreviewResponseDto> {
    return this.cases.closePreview(actor, caseId);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('medical-cases/:caseId/close')
  @ApiOperation({
    summary: 'Close a case with final conclusion and total cost (F3.9)',
    description:
      'Lệnh khóa gắn bệnh án còn hiệu lực thì bắt buộc lockDecision (RELEASE hoặc KEEP kèm lockExpectedEnd). Bệnh án đã đóng: 409.',
  })
  @ApiCreatedResponse({ type: MedicalCaseResponseDto })
  close(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: CloseMedicalCaseDto,
  ): Promise<MedicalCaseResponseDto> {
    return this.cases.closeCase(actor, caseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('medical-cases/:caseId/cost')
  @ApiOperation({
    summary: 'Adjust the cost of a closed case with a reason (F3.9)',
    description: 'Bệnh án chưa đóng: 409.',
  })
  @ApiOkResponse({ type: MedicalCaseResponseDto })
  adjustCost(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: AdjustCaseCostDto,
  ): Promise<MedicalCaseResponseDto> {
    return this.cases.adjustCost(actor, caseId, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get('medical/cost-report')
  @ApiOperation({
    summary: 'Medical cost report by closing date (F3.10)',
    description: 'Lọc theo khu hoặc chủ ngựa hiện tại trên hồ sơ.',
  })
  @ApiOkResponse({ type: MedicalCostReportResponseDto })
  costReport(
    @CurrentUser() actor: Actor,
    @Query() query: MedicalCostReportQueryDto,
  ): Promise<MedicalCostReportResponseDto> {
    return this.cases.costReport(actor, query);
  }
}
