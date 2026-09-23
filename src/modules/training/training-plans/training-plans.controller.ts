import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CancelTrainingPlanDto,
  CreateTrainingPlanDto,
  TrainingPlanResponseDto,
  UpdateTrainingPlanDto,
} from '../dto/training-plan.dto';
import { TrainingPlansService } from './training-plans.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingPlansController {
  constructor(private readonly plans: TrainingPlansService) {}

  /**
   * Lấy danh sách tất cả các kế hoạch huấn luyện của một con ngựa trong CLB.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của con ngựa cần xem danh sách giáo án
   * @returns Danh sách các giáo án huấn luyện (sắp xếp theo ngày bắt đầu giảm dần)
   */
  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/training-plans')
  @ApiOperation({
    summary: 'List horse training plans',
    description:
      'Dữ liệu tab Huấn luyện của hồ sơ ngựa (F1.3). GROOM không xem tab này nên nhận 403.',
  })
  @ApiOkResponse({ type: [TrainingPlanResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ) {
    return this.plans.listPlansByHorse(actor, horseId);
  }

  /**
   * Tạo mới một kế hoạch huấn luyện cho con ngựa.
   * Yêu cầu quyền: HEAD_TRAINER hoặc CLUB_MANAGER.
   * Giáo án được tạo sẽ ở trạng thái ban đầu là SCHEDULED.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của con ngựa được lập kế hoạch
   * @param body Dữ liệu tạo kế hoạch (tên giai đoạn, mục tiêu, ngày bắt đầu, ngày kết thúc)
   * @returns Kế hoạch huấn luyện vừa được tạo
   */
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('horses/:horseId/training-plans')
  @ApiOperation({ summary: 'Create training plan' })
  @ApiCreatedResponse({ type: TrainingPlanResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateTrainingPlanDto,
  ) {
    return this.plans.createTrainingPlan(actor, horseId, body);
  }

  /**
   * Lấy thông tin chi tiết của một kế hoạch huấn luyện theo ID.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của kế hoạch huấn luyện
   * @returns Thông tin chi tiết của kế hoạch huấn luyện
   */
  @Get('training-plans/:id')
  @ApiOperation({ summary: 'Get training plan' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.getPlanById(actor, id);
  }

  /**
   * Cập nhật thông tin kế hoạch huấn luyện đang ở trạng thái SCHEDULED.
   * Yêu cầu quyền: HEAD_TRAINER hoặc CLUB_MANAGER.
   * Cho phép sửa tên giai đoạn, mục tiêu, ngày bắt đầu và kết thúc (phải bao phủ các buổi tập đã lên lịch).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của kế hoạch huấn luyện cần chỉnh sửa
   * @param body Dữ liệu cập nhật từng phần (UpdateTrainingPlanDto)
   * @returns Kế hoạch huấn luyện sau khi cập nhật
   */
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('training-plans/:id')
  @ApiOperation({ summary: 'Update a scheduled training plan' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) planId: string,
    @Body() body: UpdateTrainingPlanDto,
  ) {
    return this.plans.updatePlan(actor, planId, body);
  }

  /**
   * Kích hoạt kế hoạch huấn luyện chuyển trạng thái từ SCHEDULED sang ACTIVE.
   * Yêu cầu quyền: HEAD_TRAINER hoặc CLUB_MANAGER.
   * Điều kiện: Giáo án phải có ít nhất 1 buổi tập và con ngựa chưa có giáo án ACTIVE nào khác.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của kế hoạch huấn luyện cần kích hoạt
   * @returns Kế hoạch huấn luyện sau khi kích hoạt (status ACTIVE, kèm activatedAt)
   */
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/activate')
  @ApiOperation({ summary: 'Activate training plan' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  activate(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.activatePlan(actor, id);
  }

  /**
   * Đánh dấu hoàn thành kế hoạch huấn luyện chuyển trạng thái từ ACTIVE sang COMPLETED.
   * Yêu cầu quyền: HEAD_TRAINER hoặc CLUB_MANAGER.
   * Điều kiện: Không còn buổi tập nào dở dang (SCHEDULED/IN_PROGRESS) và có ít nhất 1 buổi tập COMPLETED.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của kế hoạch huấn luyện cần hoàn thành
   * @returns Kế hoạch huấn luyện sau khi hoàn thành (status COMPLETED, kèm completedAt)
   */
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/complete')
  @ApiOperation({ summary: 'Complete training plan' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  complete(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.completePlan(actor, id);
  }

  /**
   * Hủy bỏ kế hoạch huấn luyện và tự động hủy dây chuyền các buổi tập con chưa hoàn thành.
   * Yêu cầu quyền: HEAD_TRAINER hoặc CLUB_MANAGER.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của kế hoạch huấn luyện cần hủy
   * @param body Lý do hủy kế hoạch (CancelTrainingPlanDto)
   * @returns Kế hoạch huấn luyện sau khi hủy (status CANCELLED, kèm lý do và cancelledAt)
   */
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/cancel')
  @ApiOperation({ summary: 'Cancel training plan and scheduled sessions' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  cancel(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelTrainingPlanDto,
  ) {
    return this.plans.cancelPlan(actor, id, body);
  }
}
