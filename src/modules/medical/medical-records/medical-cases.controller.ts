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
  CloseMedicalCaseDto,
  CorrectCaseConclusionDto,
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
    summary: 'List horse medical cases',
    description:
      'Mới nhất lên trên. totalCost của mỗi bệnh án cộng các buổi khám chưa hủy của bệnh án; totalCost của danh sách cộng mọi buổi khám chưa hủy của ngựa, trong và ngoài bệnh án. Horse Owner chỉ được cộng buổi khám thuộc giai đoạn mình sở hữu. Head Trainer không có key chi phí.',
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
    summary: 'Get a medical case with its visits',
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
    summary: 'Record a follow-up visit in an open case',
    description:
      'cost tùy chọn, bỏ trống là 0. Bệnh án đã đóng: 409. Thời điểm khám là thời điểm ghi.',
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
    summary: 'Preview what must be handled before closing a case',
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
    summary: 'Close a case with final conclusion',
    description:
      'Ngựa còn lệnh khóa huấn luyện đang hiệu lực (kể cả lệnh giữ lại từ bệnh án trước) thì bắt buộc lockDecision (RELEASE hoặc KEEP kèm lockExpectedEnd). Bệnh án đã đóng: 409.',
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
  @Patch('medical-cases/:caseId/conclusion')
  @ApiOperation({
    summary: 'Correct the final conclusion of a closed case with a reason',
    description:
      'Chỉ đổi kết luận cuối, ghi nhật ký kèm lý do, không báo ai. Kết luận trùng kết luận cũ thì không ghi gì. Bệnh án đang điều trị hoặc đã hủy: 409. Ngựa đã chuyển nhượng hoặc đã mất: 409.',
  })
  @ApiOkResponse({ type: MedicalCaseResponseDto })
  correctConclusion(
    @CurrentUser() actor: Actor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: CorrectCaseConclusionDto,
  ): Promise<MedicalCaseResponseDto> {
    return this.cases.correctConclusion(actor, caseId, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get('medical/cost-report')
  @ApiOperation({
    summary: 'Medical cost report by exam date',
    description:
      'Cộng chi phí các buổi khám chưa hủy (trong và ngoài bệnh án) có ngày khám trong khoảng, theo lịch câu lạc bộ. Lọc theo khu của ngựa lúc khám, hoặc theo chủ của giai đoạn sở hữu chứa ngày khám.',
  })
  @ApiOkResponse({ type: MedicalCostReportResponseDto })
  costReport(
    @CurrentUser() actor: Actor,
    @Query() query: MedicalCostReportQueryDto,
  ): Promise<MedicalCostReportResponseDto> {
    return this.cases.costReport(actor, query);
  }
}
