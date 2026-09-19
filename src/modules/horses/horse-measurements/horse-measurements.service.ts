import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import type { Actor } from '../../../common/types/actor';
import { isHorseInTrainerBarn } from '../../stable/utils/trainer-barn';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import {
  HORSE_MEASUREMENT_ALERT_EVENT,
  HORSE_MEASUREMENT_SPECS,
  WEIGHT_DROP_WINDOW_DAYS,
} from '../constants/horse.constants';
import {
  CreatedHorseMeasurementResponseDto,
  CreateHorseMeasurementDto,
  HorseMeasurementListQueryDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
import {
  toCreatedMeasurementResponse,
  toMeasurementResponse,
} from '../mappers/horse.mapper';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import {
  measuredAtError,
  measurementAlerts,
  measurementValueError,
  recordableMeasurementTypes,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type { HorseMeasurementAlertEvent } from '../types/horse.types';
import { HorseMeasurementsRepository } from './horse-measurements.repository';

@Injectable()
export class HorseMeasurementsService {
  constructor(
    private readonly measurements: HorseMeasurementsRepository,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  /**
   * List the measurements of a horse visible to the caller
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param query The query parameters
   * @returns A promise resolving to the measurements of the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async listMeasurements(
    actor: Actor,
    horseId: string,
    query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    await this.access.findReadable(actor, horseId);
    const measurements = await this.measurements.listMeasurements(
      horseId,
      query.type,
    );
    return measurements.map(toMeasurementResponse);
  }

  /**
   * Ghi một chỉ số cơ thể cho con ngựa (F1.7).
   *
   * - Mỗi role chỉ ghi được một số loại, trong phạm vi của mình (xem recordableMeasurementTypes)
   * - Giá trị phải trong khoảng hợp lệ của loại; thời điểm đo không ở tương lai, lùi tối đa 7 ngày
   * - Tự sinh cảnh báo (sốt, giảm cân trong 14 ngày), trả trong response và phát HORSE_MEASUREMENT_ALERT_EVENT sau khi lưu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Loại, giá trị và thời điểm đo (mặc định là hiện tại)
   * @returns Promise trả về bản ghi vừa tạo kèm các cảnh báo
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi không được ghi loại chỉ số này cho con ngựa này
   * @throws BadRequestException Nếu là ngựa tham chiếu, giá trị ngoài khoảng hợp lệ hoặc thời điểm đo không hợp lệ
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async addMeasurement(
    actor: Actor,
    horseId: string,
    body: CreateHorseMeasurementDto,
  ): Promise<CreatedHorseMeasurementResponseDto> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findVisible(actor, horseId);
    this.access.assertOperational(horse);
    this.access.assertNotTransferred(horse);
    await this.assertCanRecordType(actor, caller.id, horseId, body.type);

    const valueError = measurementValueError(body.type, body.value);
    if (valueError) throw new BadRequestException(valueError);

    const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
    const timeError = measuredAtError(measuredAt, new Date());
    if (timeError) throw new BadRequestException(timeError);

    const weightBaseline = await this.weightBaseline(
      horseId,
      body.type,
      measuredAt,
    );
    const alerts = measurementAlerts(body.type, body.value, weightBaseline);

    const measurement = await this.measurements.addMeasurement({
      horseId,
      type: body.type,
      value: body.value.toFixed(2),
      measuredAt,
      measuredBy: caller.id,
    });

    for (const alert of alerts) {
      const event: HorseMeasurementAlertEvent = {
        ...alert,
        measurementId: measurement.id,
        horseId,
        measuredBy: caller.id,
        type: body.type,
        value: body.value,
        unit: HORSE_MEASUREMENT_SPECS[body.type].unit,
        measuredAt,
      };
      this.events.publish(HORSE_MEASUREMENT_ALERT_EVENT, event);
    }
    return toCreatedMeasurementResponse(measurement, alerts);
  }

  /**
   * Xóa mềm một bản ghi đo (F1.7: bản ghi không được sửa, chỉ xóa rồi đo lại).
   *
   * - Chỉ người đã ghi bản đó được xóa, và vẫn phải còn quyền ghi loại chỉ số đó cho con ngựa
   * - Khóa dòng bản ghi trong transaction để hai lần xóa cùng lúc không cùng qua kiểm tra
   * - Ghi audit_logs (DELETE, giá trị trước khi xóa) trong cùng transaction để giữ bằng chứng
   * - Bản đã xóa bị ẩn khỏi lịch sử, biểu đồ, chỉ số mới nhất và mốc cảnh báo giảm cân
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param measurementId UUID của bản ghi đo
   * @returns Promise hoàn tất khi đã xóa
   * @throws NotFoundException Nếu không có ngựa, ngựa ngoài phạm vi, hoặc không có bản ghi đo (chưa xóa) của ngựa này
   * @throws ForbiddenException Nếu người gọi không phải người đã ghi, hoặc không còn quyền ghi loại chỉ số này
   * @throws BadRequestException Nếu là ngựa tham chiếu
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async deleteMeasurement(
    actor: Actor,
    horseId: string,
    measurementId: string,
  ): Promise<void> {
    const caller = await this.access.currentUser(actor);
    const horse = await this.access.findVisible(actor, horseId);
    this.access.assertOperational(horse);
    this.access.assertNotTransferred(horse);

    await this.dataSource.transaction(async (manager) => {
      const measurement = await manager.findOne(HorseMeasurementEntity, {
        where: { id: measurementId, horseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!measurement) {
        throw new NotFoundException('Không tìm thấy bản ghi đo');
      }
      if (measurement.measuredBy !== caller.id) {
        throw new ForbiddenException(
          'Chỉ người đã ghi mới được xóa bản ghi đo này',
        );
      }
      await this.assertCanRecordType(
        actor,
        caller.id,
        horseId,
        measurement.type,
      );
      await manager.softDelete(HorseMeasurementEntity, { id: measurement.id });
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE_MEASUREMENT,
        entityId: measurement.id,
        before: {
          horseId: measurement.horseId,
          type: measurement.type,
          value: measurement.value,
          measuredAt: measurement.measuredAt,
          measuredBy: measurement.measuredBy,
        },
        after: null,
      });
    });
  }

  /**
   * Lấy cân nặng mốc để so cảnh báo giảm cân: cao nhất trong WEIGHT_DROP_WINDOW_DAYS ngày trước thời điểm đo.
   *
   * @param horseId UUID của ngựa
   * @param type Loại chỉ số đang ghi
   * @param measuredAt Thời điểm đo của bản ghi mới
   * @returns Promise trả về cân nặng mốc, null nếu không phải loại WEIGHT hoặc không có bản ghi trong cửa sổ
   */
  private async weightBaseline(
    horseId: string,
    type: HorseMeasurementType,
    measuredAt: Date,
  ): Promise<number | null> {
    if (type !== HorseMeasurementType.WEIGHT) return null;
    const from = new Date(
      measuredAt.getTime() - WEIGHT_DROP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.measurements.maxWeightBetween(horseId, from, measuredAt);
  }

  /**
   * Kiểm tra người gọi được ghi loại chỉ số này cho con ngựa.
   *
   * - Chỉ query khu phụ trách khi người gọi là Head Trainer, chỉ query phân công khi là Groom
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @param type Loại chỉ số cần ghi
   * @throws ForbiddenException Nếu loại chỉ số không nằm trong các loại người gọi được ghi cho con ngựa này
   */
  private async assertCanRecordType(
    actor: Actor,
    callerId: string,
    horseId: string,
    type: HorseMeasurementType,
  ): Promise<void> {
    const [isInTrainerBarn, isAssignedGroom] = await Promise.all([
      this.access.hasRole(actor, UserRole.HEAD_TRAINER)
        ? isHorseInTrainerBarn(this.dataSource.manager, horseId, callerId)
        : Promise.resolve(false),
      this.access.hasRole(actor, UserRole.GROOM)
        ? this.horses.isGroomAssigned(horseId, callerId)
        : Promise.resolve(false),
    ]);
    const allowed = recordableMeasurementTypes({
      roles: actor.roles,
      isInTrainerBarn,
      isAssignedGroom,
    });
    if (!allowed.includes(type)) {
      throw new ForbiddenException(
        'Bạn không được ghi loại chỉ số này cho con ngựa này',
      );
    }
  }
}
