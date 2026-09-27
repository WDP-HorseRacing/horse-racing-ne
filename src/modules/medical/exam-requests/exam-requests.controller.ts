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
  CreateExamRequestDto,
  DismissExamRequestDto,
  ExamRequestListQueryDto,
  ExamRequestPageResponseDto,
  ExamRequestResponseDto,
  UpdateExamRequestUrgencyDto,
} from '../dto';
import { ExamRequestsService } from './exam-requests.service';

const EXAM_REQUEST_ROLES = [
  UserRole.VETERINARIAN,
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.GROOM,
];

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class ExamRequestsController {
  constructor(private readonly examRequests: ExamRequestsService) {}

  @Access(EXAM_REQUEST_ROLES)
  @Post('horses/:horseId/exam-requests')
  @ApiOperation({
    summary: 'Request a medical exam for a horse (F3.4)',
    description:
      'Veterinarian, Club Manager: mọi ngựa. Head Trainer: ngựa thuộc khu mình (ngoài khu 403). Groom: ngựa được phân công (không được phân công 403). Ngựa đã chuyển nhượng: 409.',
  })
  @ApiCreatedResponse({ type: ExamRequestResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    return this.examRequests.create(actor, horseId, body);
  }

  @Access(EXAM_REQUEST_ROLES)
  @Get('exam-requests')
  @ApiOperation({
    summary: 'Exam request queue (F3.4)',
    description:
      'Mặc định chỉ yêu cầu Chờ xử lý, Khẩn lên trước rồi cũ nhất lên trước. Groom chỉ thấy ngựa được phân công.',
  })
  @ApiOkResponse({ type: ExamRequestPageResponseDto })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ExamRequestListQueryDto,
  ): Promise<ExamRequestPageResponseDto> {
    return this.examRequests.list(actor, query);
  }

  @Access(EXAM_REQUEST_ROLES)
  @Get('horses/:horseId/exam-requests')
  @ApiOperation({
    summary: 'List exam requests of a horse (F3.4)',
    description: 'Groom chỉ xem ngựa được phân công (403).',
  })
  @ApiOkResponse({ type: [ExamRequestResponseDto] })
  listByHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<ExamRequestResponseDto[]> {
    return this.examRequests.listByHorse(actor, horseId);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('exam-requests/:id')
  @ApiOperation({
    summary: 'Change the urgency of a pending exam request (F3.4)',
    description: 'Bắt buộc lý do. Yêu cầu không còn chờ: 409.',
  })
  @ApiOkResponse({ type: ExamRequestResponseDto })
  updateUrgency(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExamRequestUrgencyDto,
  ): Promise<ExamRequestResponseDto> {
    return this.examRequests.updateUrgency(actor, id, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('exam-requests/:id/dismiss')
  @ApiOperation({
    summary: 'Dismiss an exam request with a reason (F3.4)',
    description: 'Yêu cầu không còn chờ: 409.',
  })
  @ApiCreatedResponse({ type: ExamRequestResponseDto })
  dismiss(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DismissExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    return this.examRequests.dismiss(actor, id, body);
  }
}
