import { isISO8601, ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Chuỗi ngày theo lịch, không kèm giờ (YYYY-MM-DD).
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cắt khoảng trắng hai đầu nếu giá trị là chuỗi, dùng cho @Transform của các ô văn bản
 *
 * @param params Tham số của class-transformer
 * @returns Chuỗi đã cắt, hoặc giá trị gốc nếu không phải chuỗi
 */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Chuỗi thời điểm ISO 8601 có ngày, giờ và múi giờ (`Z` hoặc `±hh:mm`).
 */
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Kiểm ô là thời điểm ISO 8601 bắt buộc kèm múi giờ
 *
 * - Nhận `2026-10-23T00:30:00+07:00` hoặc `2026-10-22T17:30:00Z` (giây và phần lẻ giây tùy chọn)
 * - Thiếu múi giờ, chỉ có ngày, hoặc ngày giờ không tồn tại (vd 30/02): lỗi `isIsoInstant`
 *
 * @param options Tùy chọn của class-validator (vd `message`, `each`)
 * @returns Decorator gắn lên ô của DTO
 */
export function IsIsoInstant(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIsoInstant',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          ISO_INSTANT_PATTERN.test(value) &&
          isISO8601(value, { strict: true }),
        defaultMessage: () =>
          '$property phải là thời điểm ISO 8601 có múi giờ, vd 2026-10-23T00:30:00+07:00',
      },
    },
    options,
  );
}

/**
 * Kiểm ô là ngày theo lịch, đúng dạng YYYY-MM-DD và là ngày có thật
 *
 * - Kèm giờ hoặc múi giờ (vd `2026-10-20T17:00:00Z`), sai dạng, hoặc ngày không tồn tại (vd 2026-02-30): lỗi `isDateOnly`
 *
 * @param options Tùy chọn của class-validator (vd `message`, `each`)
 * @returns Decorator gắn lên ô của DTO
 */
export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          DATE_ONLY_PATTERN.test(value) &&
          isISO8601(value, { strict: true }),
        defaultMessage: () => '$property phải là ngày dạng YYYY-MM-DD',
      },
    },
    options,
  );
}
