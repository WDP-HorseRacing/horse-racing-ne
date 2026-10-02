import type {
  CreatedHorseMeasurementResponseDto,
  HorseLatestMeasurementDto,
  HorseMeasurementResponseDto,
} from '../dto';
import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HORSE_MEASUREMENT_SPECS } from '../constants/horse.constants';
import type { HorseMeasurementAlertResult } from '../types/horse.types';

/**
 * Map các field của chỉ số mới nhất, kèm đơn vị và cờ bất thường đã lưu lúc ghi
 *
 * @param entity Bản ghi chỉ số cơ thể
 * @returns Các field chỉ số mới nhất trong response
 */
export function toLatestMeasurement(
  entity: HorseMeasurementEntity,
): HorseLatestMeasurementDto {
  return {
    type: entity.type,
    value: entity.value,
    unit: HORSE_MEASUREMENT_SPECS[entity.type].unit,
    measuredAt: entity.measuredAt,
    isAbnormal: entity.isAbnormal,
  };
}

/**
 * Đọc tên người dùng từ quan hệ, báo lỗi rõ ràng khi quan hệ chưa được load
 *
 * @param user Người dùng của quan hệ, undefined hoặc null nếu chưa load
 * @param relation Tên quan hệ, dùng trong message lỗi
 * @returns Họ tên đầy đủ của người dùng
 * @throws Error Nếu quan hệ chưa được load
 */
function requiredRelationName(
  user: { fullName: string } | null | undefined,
  relation: 'measurer',
): string {
  if (!user) {
    throw new Error(
      `Quan hệ ${relation} chưa được load khi ánh xạ dữ liệu ngựa`,
    );
  }
  return user.fullName;
}

/**
 * Map một dòng lịch sử chỉ số kèm tên người đo
 *
 * @param entity Bản ghi chỉ số cơ thể đã load quan hệ measurer
 * @returns Response của bản ghi chỉ số
 */
export function toMeasurementResponse(
  entity: HorseMeasurementEntity,
): HorseMeasurementResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    measuredBy: entity.measuredBy,
    measuredByName: requiredRelationName(entity.measurer, 'measurer'),
    source: entity.source,
    ...toLatestMeasurement(entity),
  };
}

/**
 * Map bản ghi chỉ số vừa tạo kèm các cảnh báo tự động tính được
 *
 * @param entity Bản ghi chỉ số đã lưu, đã load quan hệ measurer
 * @param alerts Các cảnh báo tính cho lần đo này
 * @returns Response bản ghi chỉ số vừa tạo; cảnh báo FEVER có baselineValue và dropPercent là null
 */
export function toCreatedMeasurementResponse(
  entity: HorseMeasurementEntity,
  alerts: HorseMeasurementAlertResult[],
): CreatedHorseMeasurementResponseDto {
  return {
    ...toMeasurementResponse(entity),
    alerts: alerts.map((alert) => ({
      alert: alert.alert,
      severity: alert.severity,
      baselineValue: 'baselineValue' in alert ? alert.baselineValue : null,
      dropPercent: 'dropPercent' in alert ? alert.dropPercent : null,
    })),
  };
}
