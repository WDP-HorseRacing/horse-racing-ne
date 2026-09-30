/**
 * Ký hiệu hiển thị cho các đơn vị mà mã lưu trữ khác cách viết thông thường
 */
const UNIT_LABELS: Readonly<Record<string, string>> = {
  celsius: '°C',
};

/**
 * Ghép giá trị đo với ký hiệu đơn vị để đưa vào câu hiển thị cho người dùng (thông báo, mô tả yêu cầu khám)
 *
 * @param value Giá trị đo
 * @param unit Mã đơn vị lưu trong chỉ số (vd kg, celsius)
 * @returns Chuỗi dạng "39.1 °C" hoặc "470 kg"
 */
export function formatMeasurement(value: number, unit: string): string {
  return `${value} ${UNIT_LABELS[unit] ?? unit}`;
}
