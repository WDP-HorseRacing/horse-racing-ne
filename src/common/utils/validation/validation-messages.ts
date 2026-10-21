/**
 * Câu mặc định (tiếng Anh) của class-validator và câu tiếng Việt thay thế, theo tên constraint
 *
 * - `$property` là tên ô, `$constraintN` là tham số thứ N của constraint
 * - Câu tiếng Việt chỉ được dùng khi câu gốc đúng nguyên mẫu tiếng Anh
 */
const CONSTRAINT_MESSAGES: Readonly<
  Record<string, { en: string; vi: string }>
> = {
  isString: { en: '$property must be a string', vi: '$property phải là chuỗi' },
  maxLength: {
    en: '$property must be shorter than or equal to $constraint1 characters',
    vi: '$property tối đa $constraint1 ký tự',
  },
  minLength: {
    en: '$property must be longer than or equal to $constraint1 characters',
    vi: '$property tối thiểu $constraint1 ký tự',
  },
  isEnum: {
    en: '$property must be one of the following values: $constraint2',
    vi: '$property phải là một trong: $constraint2',
  },
  isIn: {
    en: '$property must be one of the following values: $constraint1',
    vi: '$property phải là một trong: $constraint1',
  },
  isUuid: { en: '$property must be a UUID', vi: '$property phải là UUID' },
  min: {
    en: '$property must not be less than $constraint1',
    vi: '$property không được nhỏ hơn $constraint1',
  },
  max: {
    en: '$property must not be greater than $constraint1',
    vi: '$property không được lớn hơn $constraint1',
  },
  isDateString: {
    en: '$property must be a valid ISO 8601 date string',
    vi: '$property phải là ngày giờ theo chuẩn ISO 8601',
  },
  isIso8601: {
    en: '$property must be a valid ISO 8601 date string',
    vi: '$property phải là ngày giờ theo chuẩn ISO 8601',
  },
  isInt: {
    en: '$property must be an integer number',
    vi: '$property phải là số nguyên',
  },
  isNumber: {
    en: '$property must be a number conforming to the specified constraints',
    vi: '$property phải là số hợp lệ',
  },
  isPositive: {
    en: '$property must be a positive number',
    vi: '$property phải là số dương',
  },
  isBoolean: {
    en: '$property must be a boolean value',
    vi: '$property phải là true hoặc false',
  },
  isArray: { en: '$property must be an array', vi: '$property phải là mảng' },
  arrayMaxSize: {
    en: '$property must contain no more than $constraint1 elements',
    vi: '$property tối đa $constraint1 phần tử',
  },
  arrayMinSize: {
    en: '$property must contain at least $constraint1 elements',
    vi: '$property phải có ít nhất $constraint1 phần tử',
  },
  arrayUnique: {
    en: "All $property's elements must be unique",
    vi: 'Các phần tử của $property không được trùng nhau',
  },
  isEmail: {
    en: '$property must be an email',
    vi: '$property phải là email hợp lệ',
  },
  isObject: {
    en: '$property must be an object',
    vi: '$property phải là object',
  },
  matches: {
    en: '$property must match $constraint1 regular expression',
    vi: '$property không đúng định dạng',
  },
  isNotEmpty: {
    en: '$property should not be empty',
    vi: '$property không được để trống',
  },
  isDefined: {
    en: '$property should not be null or undefined',
    vi: '$property là bắt buộc',
  },
  whitelistValidation: {
    en: 'property $property should not exist',
    vi: 'Không nhận ô $property',
  },
  nestedValidation: {
    en: 'nested property $property must be either object or array',
    vi: '$property phải là object hoặc mảng',
  },
};

/**
 * Tiền tố class-validator thêm vào câu khi kiểm từng phần tử của mảng (`each: true`)
 */
const EACH_PREFIX = 'each value in ';

/**
 * Câu lỗi tiếng Anh của các pipe dựng sẵn của Nest và câu tiếng Việt thay thế
 */
const PIPE_MESSAGES: Readonly<Record<string, string>> = {
  'Validation failed (uuid is expected)':
    'Mã định danh trên đường dẫn phải là UUID',
  'Validation failed (numeric string is expected)':
    'Giá trị trên đường dẫn phải là số',
  'Validation failed (enum string is expected)':
    'Giá trị trên đường dẫn không nằm trong danh sách cho phép',
};

/**
 * Dịch câu lỗi mặc định của một constraint class-validator sang tiếng Việt
 *
 * - Câu gốc đúng mẫu mặc định (kể cả mẫu `each value in`): trả câu tiếng Việt, giữ tên ô và tham số lấy từ câu gốc
 * - Câu do DTO tự viết hoặc constraint chưa có trong bảng: trả nguyên câu gốc
 *
 * @param constraint Tên constraint (vd `isString`, `maxLength`)
 * @param message Câu lỗi class-validator đã sinh
 * @returns Câu lỗi tiếng Việt, hoặc câu gốc nếu không khớp mẫu
 */
export function translateConstraint(
  constraint: string,
  message: string,
): string {
  const template = CONSTRAINT_MESSAGES[constraint];
  if (!template) return message;
  const names: string[] = [];
  const pattern = escapeRegExp(template.en).replace(
    /\\\$(property|constraint\d)/g,
    (_, name: string) => {
      names.push(name);
      return '(.+?)';
    },
  );
  const match = new RegExp(`^(${escapeRegExp(EACH_PREFIX)})?${pattern}$`).exec(
    message,
  );
  if (!match) return message;
  const translated = names.reduce(
    (text, name, index) => text.replace(`$${name}`, () => match[index + 2]),
    template.vi,
  );
  return match[1] ? `Mỗi phần tử của ${translated}` : translated;
}

/**
 * Dịch câu lỗi tiếng Anh của các pipe dựng sẵn của Nest (vd ParseUUIDPipe)
 *
 * @param message Câu lỗi của exception
 * @returns Câu tiếng Việt nếu là câu của pipe dựng sẵn, nếu không trả nguyên câu
 */
export function translatePipeMessage(message: string): string {
  return PIPE_MESSAGES[message] ?? message;
}

/**
 * Thoát các ký tự đặc biệt để dùng chuỗi làm mẫu RegExp
 *
 * @param text Chuỗi cần thoát
 * @returns Chuỗi đã thoát ký tự đặc biệt của RegExp
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
