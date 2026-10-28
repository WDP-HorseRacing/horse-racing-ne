export enum HorseHealthStatus {
  /** Đủ điều kiện */
  ELIGIBLE = 'ELIGIBLE',
  /** Đang được theo dõi */
  UNDER_OBSERVATION = 'UNDER_OBSERVATION',
  /** Chấn thương */
  INJURED = 'INJURED',
  /** Cách ly */
  QUARANTINED = 'QUARANTINED',
}

export enum HorseLifecycleStatus {
  /** Ngựa còn hoạt động trong câu lạc bộ */
  ACTIVE = 'ACTIVE',
  /** Ngựa đã nghỉ hưu, không còn hoạt động trong câu lạc bộ */
  RETIRED = 'RETIRED',
  /** Ngựa đã được chuyển nhượng sang câu lạc bộ khác */
  TRANSFERRED = 'TRANSFERRED',
  /** Ngựa đã mất, trạng thái cuối */
  DECEASED = 'DECEASED',
}
