export enum HorseHealthStatus {
  ELIGIBLE = 'ELIGIBLE', // Đủ điều kiện
  UNDER_OBSERVATION = 'UNDER_OBSERVATION', // Đang được theo dõi
  INJURED = 'INJURED', // Chân thương
  QUARANTINED = 'QUARANTINED', // Cách ly
}

export enum HorseLifecycleStatus {
  ACTIVE = 'ACTIVE', // Ngựa còn hoạt động trong câu lạc bộ
  RETIRED = 'RETIRED', // Ngựa đã nghỉ hưu, không còn hoạt động trong câu lạc bộ
  TRANSFERRED = 'TRANSFERRED', // Ngựa đã được chuyển nhượng sang câu lạc bộ khác
}
