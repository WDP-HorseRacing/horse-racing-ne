import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Mã lỗi Postgres khi ghi trùng một unique constraint
 */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Lấy tên constraint bị trùng từ lỗi của TypeORM
 *
 * @param error Lỗi bắt được khi chạy thao tác ghi
 * @returns Tên constraint (chuỗi rỗng nếu driver không trả tên), hoặc null nếu không phải lỗi trùng unique
 */
function uniqueViolationConstraint(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driverError = error.driverError as
    { code?: string; constraint?: string } | undefined;
  if (driverError?.code !== PG_UNIQUE_VIOLATION) return null;
  return driverError.constraint ?? '';
}

/**
 * Chạy thao tác ghi, đổi lỗi trùng unique thành 409 theo tên constraint
 *
 * - Constraint có trong `messagesByConstraint`: ném 409 với câu tương ứng
 * - Constraint khác hoặc lỗi khác: ném lại lỗi gốc
 *
 * @param operation Thao tác ghi cần chạy
 * @param messagesByConstraint Câu báo lỗi theo tên unique constraint
 * @returns Promise trả về kết quả của thao tác
 * @throws ConflictException Nếu thao tác trùng một constraint có trong `messagesByConstraint`
 */
export async function mapUniqueViolation<T>(
  operation: () => Promise<T>,
  messagesByConstraint: Readonly<Record<string, string>>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    const message =
      constraint === null ? undefined : messagesByConstraint[constraint];
    if (message) throw new ConflictException(message);
    throw error;
  }
}

/**
 * Chạy thao tác ghi, đổi mọi lỗi trùng unique thành 409 với một câu cố định
 *
 * @param operation Thao tác ghi cần chạy
 * @param message Câu báo lỗi khi trùng bất kỳ unique constraint nào
 * @returns Promise trả về kết quả của thao tác
 * @throws ConflictException Nếu thao tác trùng một unique constraint
 */
export async function mapAnyUniqueViolation<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (uniqueViolationConstraint(error) !== null) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
