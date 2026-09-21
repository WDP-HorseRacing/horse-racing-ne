/**
 * Loại cảnh báo tự động sinh ra khi ghi chỉ số cơ thể (F1.7).
 *
 * - FEVER: thân nhiệt vượt ngưỡng sốt
 * - WEIGHT_DROP: cân nặng giảm quá ngưỡng trong cửa sổ ngày gần nhất (cảnh báo y tế và quá tải)
 */
export enum HorseMeasurementAlert {
  FEVER = 'FEVER',
  WEIGHT_DROP = 'WEIGHT_DROP',
}

/**
 * Mức độ của cảnh báo chỉ số: URGENT là thông báo khẩn, WARNING là cảnh báo thường.
 */
export enum HorseMeasurementAlertSeverity {
  URGENT = 'URGENT',
  WARNING = 'WARNING',
}
