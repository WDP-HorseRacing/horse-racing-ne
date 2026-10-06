import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Một lỗi gắn với một ô của request body
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Tạo lỗi 400 gắn với một ô của request body
 *
 * @param field Tên ô theo request body (vd `dateOfBirth`, `damId`)
 * @param message Câu báo lỗi
 * @returns BadRequestException có `message` và `errors` một phần tử
 */
export function fieldBadRequest(
  field: string,
  message: string,
): BadRequestException {
  return new BadRequestException({ message, errors: [{ field, message }] });
}

/**
 * Đổi các constraint của một lỗi class-validator thành lỗi theo ô
 *
 * @param error Lỗi class-validator của một ô
 * @param parentPath Đường dẫn của object cha, rỗng ở cấp ngoài cùng
 * @returns Mỗi constraint một lỗi, câu lỗi có tiền tố đường dẫn cha như ValidationPipe mặc định
 */
function constraintErrors(
  error: ValidationError,
  parentPath: string,
): FieldError[] {
  const field = parentPath ? `${parentPath}.${error.property}` : error.property;
  return Object.values(error.constraints ?? {}).map((constraint) => ({
    field,
    message: parentPath ? `${parentPath}.${constraint}` : constraint,
  }));
}

/**
 * Trải phẳng lỗi class-validator thành danh sách lỗi theo ô
 *
 * - Ô lồng nhau: `field` nối bằng dấu chấm (vd `items.0.code`)
 * - Câu lỗi và thứ tự giống hệt ValidationPipe mặc định
 *
 * @param errors Lỗi class-validator của một object
 * @param parentPath Đường dẫn của object cha, rỗng ở cấp ngoài cùng
 * @returns Danh sách lỗi theo ô
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    if (!error.children?.length) return constraintErrors(error, parentPath);
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    return error.children.flatMap((child) => [
      ...(child.children?.length ? flattenValidationErrors([child], path) : []),
      ...constraintErrors(child, path),
    ]);
  });
}

/**
 * Tạo lỗi 400 cho ValidationPipe, giữ `message` dạng mảng câu như mặc định và thêm `errors` theo ô
 *
 * @param errors Lỗi class-validator của request
 * @returns BadRequestException có `message` là mảng câu và `errors` theo ô
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fieldErrors = flattenValidationErrors(errors);
  return new BadRequestException({
    message: fieldErrors.map((error) => error.message),
    errors: fieldErrors,
  });
}
