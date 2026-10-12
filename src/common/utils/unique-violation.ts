import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { fieldConflict, type FieldError } from './field-errors';

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
 * - Constraint ứng với một câu: ném 409 với câu đó
 * - Constraint ứng với một ô ({ field, message }): ném 409 gắn ô đó trong `errors`
 * - Constraint khác hoặc lỗi khác: ném lại lỗi gốc
 *
 * @param operation Thao tác ghi cần chạy
 * @param conflictsByConstraint Câu báo lỗi hoặc ô kèm câu báo lỗi theo tên unique constraint
 * @returns Promise trả về kết quả của thao tác
 * @throws ConflictException Nếu thao tác trùng một constraint có trong `conflictsByConstraint`
 */
export async function mapUniqueViolation<T>(
  operation: () => Promise<T>,
  conflictsByConstraint: Readonly<Record<string, string | FieldError>>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    const conflict =
      constraint === null ? undefined : conflictsByConstraint[constraint];
    if (typeof conflict === 'string') throw new ConflictException(conflict);
    if (conflict) throw fieldConflict(conflict.field, conflict.message);
    throw error;
  }
}

/**
 * Chạy thao tác ghi, đổi mọi lỗi trùng unique thành 409 gắn một ô cố định
 *
 * @param operation Thao tác ghi cần chạy
 * @param conflict Ô bị trùng và câu báo lỗi khi trùng bất kỳ unique constraint nào
 * @returns Promise trả về kết quả của thao tác
 * @throws ConflictException Nếu thao tác trùng một unique constraint
 */
export async function mapAnyUniqueViolation<T>(
  operation: () => Promise<T>,
  conflict: FieldError,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (uniqueViolationConstraint(error) !== null) {
      throw fieldConflict(conflict.field, conflict.message);
    }
    throw error;
  }
}
