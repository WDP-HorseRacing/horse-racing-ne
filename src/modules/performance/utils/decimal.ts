/**
 * Số thập phân chính xác: giá trị = units × 10^-scale.
 */
interface ExactDecimal {
  units: bigint;
  scale: number;
}

/**
 * Đọc chuỗi số thập phân (vd "12.25", "-3", "1.5E+2", chuỗi Decimal128) thành số nguyên kèm số chữ số thập phân
 *
 * @param value Chuỗi số thập phân
 * @returns Số thập phân chính xác
 * @throws Error Nếu chuỗi không phải số thập phân
 */
function parseDecimal(value: string): ExactDecimal {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(
    value.trim(),
  );
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new Error(`Không đọc được số thập phân "${value}"`);
  }
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  let units = BigInt(`${whole || '0'}${fraction}`);
  let scale = fraction.length - Number(exponent);
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { units: sign === '-' ? -units : units, scale };
}

/**
 * Chia rồi làm tròn nửa xa số 0 (như ROUND của Postgres với numeric)
 *
 * @param numerator Số bị chia
 * @param denominator Số chia, dương
 * @returns Thương đã làm tròn
 */
function divideRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  if (2n * (magnitude % denominator) >= denominator) {
    quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

/**
 * Định dạng số nguyên units × 10^-scale thành chuỗi có đúng scale chữ số thập phân
 *
 * @param units Phần nguyên đã nhân 10^scale
 * @param scale Số chữ số thập phân
 * @returns Chuỗi số, vd "12.500"
 */
function formatFixed(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units)
    .toString()
    .padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/**
 * Tính trung bình của một tổng chính xác rồi làm tròn tới scale chữ số thập phân, nửa xa số 0
 *
 * - Cho cùng kết quả với `ROUND(AVG(x), scale)` của Postgres trên cột numeric
 *
 * @param sum Tổng các giá trị, dạng chuỗi số thập phân
 * @param count Số giá trị, lớn hơn 0
 * @param scale Số chữ số thập phân của kết quả
 * @returns Trung bình dạng chuỗi có đúng scale chữ số thập phân
 */
export function roundedAverage(
  sum: string,
  count: number,
  scale: number,
): string {
  const exact = parseDecimal(sum);
  const shift = scale - exact.scale;
  const numerator =
    shift >= 0 ? exact.units * 10n ** BigInt(shift) : exact.units;
  const denominator = BigInt(count) * (shift >= 0 ? 1n : 10n ** BigInt(-shift));
  return formatFixed(
    divideRoundHalfAwayFromZero(numerator, denominator),
    scale,
  );
}

/**
 * Định dạng một số thập phân với đúng scale chữ số thập phân, làm tròn nửa xa số 0 nếu dư
 *
 * @param value Số thập phân dạng chuỗi
 * @param scale Số chữ số thập phân của kết quả
 * @returns Chuỗi số, vd "12.250"
 */
export function toFixedDecimal(value: string, scale: number): string {
  return roundedAverage(value, 1, scale);
}
