import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  formatClubDateTime,
  toClubDate,
} from '../../../common/utils/club-date';
import { EligibilityReason } from '../../horses/enums/eligibility-reason.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { isReadOnlyLifecycle } from '../../horses/policies/horse.policy';
import type {
  ReadOnlyLifecycleStatus,
  EligibilityResult,
} from '../../horses/types/horse.types';

/**
 * Câu báo 409 khi ghi danh vào lớp ngựa có hồ sơ chỉ được xem, theo trạng thái
 */
const READ_ONLY_ENROLL_MESSAGES: Record<ReadOnlyLifecycleStatus, string> = {
  [HorseLifecycleStatus.TRANSFERRED]: 'Ngựa đã chuyển nhượng, không học lớp',
  [HorseLifecycleStatus.DECEASED]: 'Ngựa đã mất, không học lớp',
};
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  MAX_HEAVY_SESSIONS_PER_HORSE_DAY,
  MAX_SESSIONS_PER_HORSE_DAY,
  MIN_REST_BETWEEN_SESSIONS_MS,
} from '../constants/horse-daily-load.constants';
import { CHECK_IN_OPENS_BEFORE_MS } from '../constants/participant-window.constants';
import type {
  ClassSessionLoad,
  GroomRun,
  HorseBrief,
  HorseClassSession,
  SessionWindow,
} from '../types/training-session.types';

/**
 * Trạng thái lượt tập còn mở, tính vào lịch dắt của Groom
 */
const OPEN_GROOM_RUN_STATUSES: ReadonlyArray<SessionParticipantStatus> = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
  SessionParticipantStatus.ONGOING,
];

/**
 * Trạng thái buổi tập được tính vào lịch của ngựa ở một lớp
 */
export const HORSE_SCHEDULE_SESSION_STATUSES = [
  TrainingSessionStatus.SCHEDULED,
  TrainingSessionStatus.IN_PROGRESS,
];

export function assertClassCompletable(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.ACTIVE) {
    throw new ConflictException('Chỉ lớp đang chạy mới được hoàn thành');
  }
}

export function assertClassCancellable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Lớp đã kết thúc');
  }
}

export function assertClassEditable(status: TrainingClassStatus): void {
  if (
    status === TrainingClassStatus.COMPLETED ||
    status === TrainingClassStatus.CANCELLED
  ) {
    throw new ConflictException('Lớp đã kết thúc');
  }
}

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function assertValidDateRange(start: string, end: string): void {
  if (dateOnly(start) > dateOnly(end)) {
    throw new BadRequestException(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    );
  }
}

/**
 * Kiểm giờ buổi tập hợp lệ và nằm trong thời gian của lớp, so theo ngày lịch CLB
 *
 * @param scheduledStartAt Thời điểm bắt đầu buổi
 * @param scheduledEndAt Thời điểm kết thúc buổi
 * @param startDate Ngày bắt đầu lớp dạng YYYY-MM-DD
 * @param endDate Ngày kết thúc lớp dạng YYYY-MM-DD
 * @throws BadRequestException Nếu giờ kết thúc không sau giờ bắt đầu, hoặc ngày buổi tập theo lịch CLB nằm ngoài thời gian lớp
 */
export function assertSessionWindowInClass(
  scheduledStartAt: string | Date,
  scheduledEndAt: string | Date,
  startDate: string,
  endDate: string,
): void {
  const start = new Date(scheduledStartAt).getTime();
  const end = new Date(scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu');
  }
  const startDay = toClubDate(new Date(start));
  const endDay = toClubDate(new Date(end));
  if (startDay < dateOnly(startDate) || endDay > dateOnly(endDate)) {
    throw new BadRequestException('Buổi tập phải nằm trong thời gian của lớp');
  }
}

/**
 * Kiểm hai buổi tập có trùng giờ không
 *
 * - Mỗi buổi tính từ giờ bắt đầu tới trước giờ kết thúc; buổi này kết thúc đúng lúc buổi kia bắt đầu thì không trùng
 *
 * @param a Khoảng giờ của buổi thứ nhất
 * @param b Khoảng giờ của buổi thứ hai
 * @returns true nếu hai buổi trùng giờ
 */
export function sessionWindowsOverlap(
  a: SessionWindow,
  b: SessionWindow,
): boolean {
  return (
    a.scheduledStartAt < b.scheduledEndAt &&
    b.scheduledStartAt < a.scheduledEndAt
  );
}

/**
 * Chặn buổi tập trùng giờ với buổi khác của cùng lớp
 *
 * @param window Khoảng giờ của buổi đang thêm hoặc sửa
 * @param others Các buổi chưa hủy khác của lớp
 * @throws ConflictException Nếu trùng giờ với một buổi; câu báo kèm giờ và ngày bắt đầu của buổi trùng theo giờ CLB
 */
export function assertNoOverlappingClassSession(
  window: SessionWindow,
  others: ReadonlyArray<SessionWindow>,
): void {
  const clash = others.find((other) => sessionWindowsOverlap(window, other));
  if (clash) {
    throw new ConflictException(
      `Trùng giờ với buổi tập lúc ${formatClubDateTime(clash.scheduledStartAt)} của lớp`,
    );
  }
}

/**
 * Tìm buổi của ngựa ở lớp khác trùng giờ với một buổi tập
 *
 * @param window Khoảng giờ của buổi tập cần xét
 * @param holdings Các buổi ngựa đang giữ chỗ hoặc các buổi trong lịch của ngựa ở lớp khác
 * @returns Buổi trùng giờ đầu tiên, undefined nếu không có
 */
export function findOverlappingHolding(
  window: SessionWindow,
  holdings: ReadonlyArray<HorseClassSession>,
): HorseClassSession | undefined {
  return holdings.find((holding) => sessionWindowsOverlap(window, holding));
}

/**
 * Chặn ghi danh khi một buổi của lớp đang ghi danh trùng giờ với buổi của ngựa ở lớp khác
 *
 * @param horseName Tên ngựa
 * @param sessions Các buổi của lớp đang ghi danh cần xét
 * @param holdings Các buổi ngựa đang giữ chỗ hoặc các buổi trong lịch của ngựa ở lớp khác
 * @throws ConflictException Nếu một buổi trùng giờ với buổi của ngựa ở lớp khác
 */
export function assertNoHoldingOverlap(
  horseName: string,
  sessions: ReadonlyArray<SessionWindow>,
  holdings: ReadonlyArray<HorseClassSession>,
): void {
  for (const session of sessions) {
    const clash = findOverlappingHolding(session, holdings);
    if (clash) {
      throw new ConflictException(
        `Ngựa ${horseName} đã có buổi tập trùng giờ ở lớp ${clash.classCode}`,
      );
    }
  }
}

/**
 * Tìm các cặp lượt Groom phải dắt trùng giờ nhau
 *
 * - Chỉ xét lượt còn mở (PLANNED, PRESENT, READY, ONGOING) của buổi chưa hủy, ở cả hai phía
 * - Hai lượt trùng khi khoảng giờ buổi giao nhau; sát mép không trùng
 * - Bỏ qua cặp cùng một buổi
 *
 * @param runs Các lượt sắp giao cho Groom
 * @param busy Các lượt Groom đang được giao dắt
 * @returns Các cặp lượt sắp giao và lượt đang dắt trùng giờ, theo thứ tự của runs rồi busy
 */
export function findGroomRunClashes(
  runs: ReadonlyArray<GroomRun>,
  busy: ReadonlyArray<GroomRun>,
): Array<{ run: GroomRun; clash: GroomRun }> {
  const open = busy.filter(isOpenGroomRun);
  return runs
    .filter(isOpenGroomRun)
    .flatMap((run) =>
      open
        .filter(
          (other) =>
            other.sessionId !== run.sessionId &&
            sessionWindowsOverlap(run, other),
        )
        .map((clash) => ({ run, clash })),
    );
}

/**
 * Chặn giao người dắt cho một lượt khi Groom đang dắt lượt khác trùng giờ
 *
 * @param run Lượt sắp giao cho Groom
 * @param busy Các lượt Groom đang được giao dắt
 * @throws ConflictException Nếu trùng giờ; câu báo nêu ngựa, tên buổi và giờ bắt đầu theo giờ CLB của lượt đang dắt
 */
export function assertGroomFreeForRun(
  run: GroomRun,
  busy: ReadonlyArray<GroomRun>,
): void {
  const [first] = findGroomRunClashes([run], busy);
  if (first) {
    throw new ConflictException(
      `Groom đang dắt ngựa ${first.clash.horseName} ở buổi "${first.clash.sessionName}" lúc ${formatClubDateTime(first.clash.scheduledStartAt)}, trùng giờ với lượt này`,
    );
  }
}

/**
 * Chặn chuyển các lượt tập của ngựa sang Groom mới khi Groom mới đang dắt lượt khác trùng giờ
 *
 * @param runs Các lượt sẽ chuyển sang Groom mới
 * @param busy Các lượt Groom mới đang được giao dắt
 * @throws ConflictException Nếu có lượt trùng giờ; câu báo liệt kê từng cặp buổi và giờ theo giờ CLB
 */
export function assertGroomFreeForMovedRuns(
  runs: ReadonlyArray<GroomRun>,
  busy: ReadonlyArray<GroomRun>,
): void {
  const clashes = findGroomRunClashes(runs, busy);
  if (clashes.length) {
    const list = clashes
      .map(
        ({ run, clash }) =>
          `buổi "${run.sessionName}" lúc ${formatClubDateTime(run.scheduledStartAt)} trùng lượt ngựa ${clash.horseName} ở buổi "${clash.sessionName}" lúc ${formatClubDateTime(clash.scheduledStartAt)}`,
      )
      .join('; ');
    throw new ConflictException(
      `Groom mới đang dắt lượt trùng giờ: ${list}. Giao lại người dắt các lượt này trước khi đổi Groom`,
    );
  }
}

/**
 * Chặn gắn người dắt tự động khi Groom được gắn đang dắt lượt khác trùng giờ
 *
 * @param clashes Các cặp lượt sắp gắn và lượt Groom đang dắt trùng giờ (findGroomRunClashes)
 * @throws ConflictException Nếu có cặp trùng; câu báo liệt kê từng cặp ngựa, buổi và giờ theo giờ CLB
 */
export function assertNoGroomRunClashes(
  clashes: ReadonlyArray<{ run: GroomRun; clash: GroomRun }>,
): void {
  if (clashes.length) {
    const list = clashes
      .map(
        ({ run, clash }) =>
          `ngựa ${run.horseName} ở buổi "${run.sessionName}" lúc ${formatClubDateTime(run.scheduledStartAt)} trùng lượt ngựa ${clash.horseName} ở buổi "${clash.sessionName}" lúc ${formatClubDateTime(clash.scheduledStartAt)}`,
      )
      .join('; ');
    throw new ConflictException(
      `Người dắt bị trùng giờ: ${list}. Giao lại người dắt các lượt này trước`,
    );
  }
}

/**
 * Tìm các ngựa không ghi danh được vào một lớp vì trùng giờ với buổi ở lớp khác
 *
 * - Trùng khi một buổi đã công bố của lớp chồng giờ với buổi ngựa đang giữ chỗ ở lớp khác
 * - Trùng khi một buổi trong lịch của lớp chồng giờ với lịch của ngựa ở lớp khác
 *
 * @param publishedSessions Các buổi đã công bố của lớp còn tới
 * @param schedule Các buổi trong lịch của lớp còn tới (nháp, đã công bố, đang diễn ra)
 * @param holdings Các buổi nhiều ngựa đang giữ chỗ ở lớp khác
 * @param otherClassSessions Lịch của nhiều ngựa ở lớp khác
 * @returns UUID các ngựa bị trùng giờ
 */
export function horsesClashingWithClass(
  publishedSessions: ReadonlyArray<SessionWindow>,
  schedule: ReadonlyArray<SessionWindow>,
  holdings: ReadonlyArray<HorseClassSession>,
  otherClassSessions: ReadonlyArray<HorseClassSession>,
): Set<string> {
  const clashing = new Set<string>();
  for (const holding of holdings) {
    if (publishedSessions.some((s) => sessionWindowsOverlap(s, holding))) {
      clashing.add(holding.horseId);
    }
  }
  for (const other of otherClassSessions) {
    if (schedule.some((s) => sessionWindowsOverlap(s, other))) {
      clashing.add(other.horseId);
    }
  }
  return clashing;
}

/**
 * Tìm các ngựa có buổi ở lớp khác trùng giờ với một buổi tập
 *
 * - Mỗi ngựa lấy một buổi trùng, buổi bắt đầu sớm nhất
 *
 * @param window Khoảng giờ của buổi tập cần xét
 * @param horseSessions Các buổi của nhiều ngựa ở lớp khác
 * @returns Mỗi ngựa bị trùng một buổi, rỗng nếu không ngựa nào trùng
 */
export function findHorseScheduleClashes(
  window: SessionWindow,
  horseSessions: ReadonlyArray<HorseClassSession>,
): HorseClassSession[] {
  const clashes = new Map<string, HorseClassSession>();
  for (const item of horseSessions) {
    if (!sessionWindowsOverlap(window, item)) continue;
    const current = clashes.get(item.horseId);
    if (!current || item.scheduledStartAt < current.scheduledStartAt) {
      clashes.set(item.horseId, item);
    }
  }
  return [...clashes.values()];
}

/**
 * Tạo lỗi 409 liệt kê mọi ngựa có buổi trùng giờ ở lớp khác
 *
 * - Mỗi ngựa ghi tên, mã lớp và giờ bắt đầu theo giờ CLB của buổi trùng; sắp theo tên ngựa
 * - Không có tên ngựa thì ghi UUID của ngựa
 *
 * @param clashes Kết quả findHorseScheduleClashes, không rỗng
 * @param horseBriefs Map từ UUID ngựa sang tên và mã ảnh
 * @returns ConflictException với câu báo liệt kê các ngựa trùng giờ
 */
export function horseScheduleClashError(
  clashes: ReadonlyArray<HorseClassSession>,
  horseBriefs: ReadonlyMap<string, HorseBrief>,
): ConflictException {
  const items = clashes
    .map((clash) => ({
      name: horseBriefs.get(clash.horseId)?.name ?? clash.horseId,
      clash,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map(
      ({ name, clash }) =>
        `${name} (lớp ${clash.classCode}, ${formatClubDateTime(clash.scheduledStartAt)})`,
    );
  return new ConflictException(
    `Trùng giờ với lịch của ngựa: ${items.join(', ')}`,
  );
}

/**
 * Một buổi trong lịch làm buổi đang xét vượt giới hạn tập trong ngày của ngựa, kèm cách vượt
 */
export interface DailyLoadConflict {
  other: ClassSessionLoad;
  reason: 'REST' | 'DAY_LIMIT' | 'HEAVY_DAY_LIMIT';
}

/**
 * Tìm buổi trong lịch làm một buổi vượt giới hạn tập trong ngày của ngựa
 *
 * - Hai buổi cách nhau dưới 3 giờ (kết thúc buổi trước tới bắt đầu buổi sau, kể cả qua nửa đêm): REST
 * - Cùng ngày theo lịch CLB đã có đủ 2 buổi: DAY_LIMIT
 * - Buổi đang xét là HEAVY và cùng ngày đã có buổi HEAVY: HEAVY_DAY_LIMIT
 * - Xét theo thứ tự trên; mỗi cách lấy buổi bắt đầu sớm nhất
 *
 * @param session Khoảng giờ và cường độ của buổi đang xét
 * @param others Các buổi khác trong lịch, không gồm chính buổi đang xét
 * @returns Buổi gây vướng kèm cách vượt, hoặc undefined nếu không vượt
 */
export function findDailyLoadConflict(
  session: SessionWindow & { intensity: TrainingIntensity },
  others: ReadonlyArray<ClassSessionLoad>,
): DailyLoadConflict | undefined {
  const ordered = [...others].sort(
    (a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
  );
  const rest = ordered.find(
    (other) =>
      session.scheduledStartAt.getTime() <
        other.scheduledEndAt.getTime() + MIN_REST_BETWEEN_SESSIONS_MS &&
      other.scheduledStartAt.getTime() <
        session.scheduledEndAt.getTime() + MIN_REST_BETWEEN_SESSIONS_MS,
  );
  if (rest) return { other: rest, reason: 'REST' };
  const day = toClubDate(session.scheduledStartAt);
  const sameDay = ordered.filter(
    (other) => toClubDate(other.scheduledStartAt) === day,
  );
  if (sameDay.length >= MAX_SESSIONS_PER_HORSE_DAY) {
    return { other: sameDay[0], reason: 'DAY_LIMIT' };
  }
  const heavy = sameDay.filter(
    (other) => other.intensity === TrainingIntensity.HEAVY,
  );
  if (
    session.intensity === TrainingIntensity.HEAVY &&
    heavy.length >= MAX_HEAVY_SESSIONS_PER_HORSE_DAY
  ) {
    return { other: heavy[0], reason: 'HEAVY_DAY_LIMIT' };
  }
  return undefined;
}

/**
 * Diễn giải một lần vượt giới hạn tập trong ngày thành câu báo
 *
 * @param conflict Buổi gây vướng kèm cách vượt
 * @returns Câu báo nêu cách vượt, mã lớp và giờ bắt đầu (giờ CLB) của buổi gây vướng
 */
export function dailyLoadMessage(conflict: DailyLoadConflict): string {
  const at = `lớp ${conflict.other.classCode}, ${formatClubDateTime(conflict.other.scheduledStartAt)}`;
  switch (conflict.reason) {
    case 'REST':
      return `chưa nghỉ đủ 3 giờ so với buổi khác (${at})`;
    case 'DAY_LIMIT':
      return `đã đủ ${MAX_SESSIONS_PER_HORSE_DAY} buổi trong ngày (${at})`;
    case 'HEAVY_DAY_LIMIT':
      return `đã có buổi Nặng trong ngày (${at})`;
  }
}

/**
 * Tạo lỗi 409 khi buổi vượt giới hạn tập trong ngày của các ngựa đang học lớp
 *
 * - Mỗi ngựa ghi tên và cách vượt; sắp theo tên ngựa; không có tên thì ghi UUID
 *
 * @param conflicts Mỗi ngựa vượt một lần
 * @param horseBriefs Map từ UUID ngựa sang tên và mã ảnh
 * @returns ConflictException liệt kê các ngựa vượt giới hạn
 */
export function horseDailyLoadError(
  conflicts: ReadonlyArray<{ horseId: string; conflict: DailyLoadConflict }>,
  horseBriefs: ReadonlyMap<string, HorseBrief>,
): ConflictException {
  const items = conflicts
    .map((item) => ({
      name: horseBriefs.get(item.horseId)?.name ?? item.horseId,
      message: dailyLoadMessage(item.conflict),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map(({ name, message }) => `${name} ${message}`);
  return new ConflictException(
    `Vượt giới hạn tập trong ngày của ngựa: ${items.join('; ')}`,
  );
}

/**
 * Gom lịch ở lớp khác và các buổi đang giữ chỗ của nhiều ngựa theo từng ngựa, bỏ buổi lặp
 *
 * @param sessions Lịch ở lớp khác và buổi giữ chỗ của nhiều ngựa
 * @returns Map từ UUID ngựa sang các buổi không lặp của ngựa đó
 */
export function sessionsByHorse(
  sessions: ReadonlyArray<HorseClassSession>,
): Map<string, HorseClassSession[]> {
  const result = new Map<string, Map<string, HorseClassSession>>();
  for (const item of sessions) {
    const own =
      result.get(item.horseId) ?? new Map<string, HorseClassSession>();
    own.set(item.sessionId, item);
    result.set(item.horseId, own);
  }
  return new Map(
    [...result].map(([horseId, own]) => [horseId, [...own.values()]]),
  );
}

/**
 * Chặn buổi vượt giới hạn tập trong ngày so với các buổi khác của cùng lớp (mọi ngựa trong lớp đều học các buổi này)
 *
 * @param classCode Mã lớp
 * @param session Khoảng giờ và cường độ của buổi đang thêm hoặc sửa
 * @param classSessions Các buổi chưa hủy khác của lớp
 * @throws ConflictException Nếu buổi vượt giới hạn tập trong ngày so với lịch của lớp
 */
export function assertClassDailyLoad(
  classCode: string,
  session: SessionWindow & { intensity: TrainingIntensity },
  classSessions: ReadonlyArray<
    SessionWindow & { id: string; intensity: TrainingIntensity }
  >,
): void {
  const conflict = findDailyLoadConflict(
    session,
    classSessions.map((item) => ({
      sessionId: item.id,
      classCode,
      intensity: item.intensity,
      scheduledStartAt: item.scheduledStartAt,
      scheduledEndAt: item.scheduledEndAt,
    })),
  );
  if (conflict) {
    throw new ConflictException(
      `Buổi vượt giới hạn tập trong ngày của lớp: ${dailyLoadMessage(conflict)}`,
    );
  }
}

export function assertTrainableHorse(isReference: boolean): void {
  if (isReference) {
    throw new BadRequestException(
      'Ngựa tham chiếu không thuộc đàn, không lập giáo án được',
    );
  }
}

/**
 * Chỉ sửa buổi tập đã lên lịch và chưa tới giờ mở điểm danh (CHECK_IN_OPENS_BEFORE_MS trước giờ bắt đầu)
 *
 * @param session Trạng thái và giờ bắt đầu của buổi
 * @param now Thời điểm hiện tại
 * @throws ConflictException Nếu buổi không còn ở trạng thái đã lên lịch, hoặc đã tới giờ mở điểm danh
 */
export function assertSessionEditable(
  session: { status: TrainingSessionStatus; scheduledStartAt: Date },
  now: Date,
): void {
  if (
    session.status !== TrainingSessionStatus.SCHEDULED ||
    session.scheduledStartAt.getTime() - CHECK_IN_OPENS_BEFORE_MS <=
      now.getTime()
  ) {
    throw new ConflictException(
      'Chỉ sửa được buổi tập đã lên lịch, trước giờ mở điểm danh (30 phút trước giờ bắt đầu)',
    );
  }
}

export function assertSessionCancellable(status: TrainingSessionStatus): void {
  if (
    status === TrainingSessionStatus.COMPLETED ||
    status === TrainingSessionStatus.CANCELLED
  ) {
    throw new ConflictException('Buổi tập đã ở trạng thái kết thúc');
  }
}

/**
 * Chặn thao tác trên lượt tập ngoài khung giờ của buổi tập
 *
 * - Khung giờ mở trước giờ bắt đầu một khoảng opensBeforeMs và đóng đúng giờ kết thúc
 *
 * @param session Giờ bắt đầu và giờ kết thúc của buổi tập
 * @param opensBeforeMs Khoảng mở sớm hơn giờ bắt đầu (ms)
 * @param now Thời điểm thao tác
 * @throws ConflictException Nếu chưa tới giờ mở hoặc buổi tập đã hết giờ
 */
export function assertParticipantActionWindow(
  session: { scheduledStartAt: Date; scheduledEndAt: Date },
  opensBeforeMs: number,
  now: Date,
): void {
  const opensAt = new Date(session.scheduledStartAt.getTime() - opensBeforeMs);
  if (now < opensAt) {
    throw new ConflictException(
      `Chưa tới giờ, mở lúc ${formatClubDateTime(opensAt)}`,
    );
  }
  if (now >= session.scheduledEndAt) {
    throw new ConflictException(
      `Buổi tập đã hết giờ lúc ${formatClubDateTime(session.scheduledEndAt)}`,
    );
  }
}

export function assertSessionOperational(status: TrainingSessionStatus): void {
  if (
    status !== TrainingSessionStatus.SCHEDULED &&
    status !== TrainingSessionStatus.IN_PROGRESS
  ) {
    throw new ConflictException(
      'Buổi tập đã kết thúc hoặc đã hủy, không thao tác được',
    );
  }
}

export function assertParticipantCheckIn(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.PLANNED) {
    throw new ConflictException(
      'Chỉ lượt tập chờ điểm danh mới được điểm danh',
    );
  }
}

/**
 * Kiểm lượt tham gia còn báo vắng được
 *
 * - Lượt chờ điểm danh, có mặt hoặc sẵn sàng: được báo vắng
 * - Lượt đang chạy hoặc đã kết thúc: 409
 *
 * @param status Trạng thái hiện tại của lượt tham gia
 * @throws ConflictException Nếu lượt không ở PLANNED, PRESENT hoặc READY
 */
export function assertParticipantAbsent(
  status: SessionParticipantStatus,
): void {
  if (
    status !== SessionParticipantStatus.PLANNED &&
    status !== SessionParticipantStatus.PRESENT &&
    status !== SessionParticipantStatus.READY
  ) {
    throw new ConflictException(
      'Chỉ lượt chờ điểm danh, có mặt hoặc sẵn sàng mới được báo vắng',
    );
  }
}

export function assertParticipantReady(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.PRESENT) {
    throw new ConflictException(
      'Lượt tập phải có mặt trước khi chuyển sang sẵn sàng',
    );
  }
}

export function assertParticipantStart(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.READY) {
    throw new ConflictException('Lượt tập phải sẵn sàng trước khi bắt đầu');
  }
}

export function assertParticipantComplete(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.ONGOING) {
    throw new ConflictException('Lượt tập phải đang tập trước khi hoàn thành');
  }
}

/**
 * Kiểm lượt tham gia còn dừng sớm được
 *
 * - Chỉ lượt đang tập được dừng sớm
 *
 * @param status Trạng thái hiện tại của lượt tham gia
 * @throws ConflictException Nếu lượt không ở ONGOING
 */
export function assertParticipantStop(status: SessionParticipantStatus): void {
  if (status !== SessionParticipantStatus.ONGOING) {
    throw new ConflictException('Chỉ lượt đang tập mới được dừng sớm');
  }
}

/**
 * Áp cường độ buổi tập lên điều kiện tập của con ngựa
 *
 * - Ngựa Cần theo dõi gặp buổi không phải LIGHT: không được tập, thêm lý do HEALTH_UNDER_OBSERVATION
 * - Các trường hợp khác: giữ nguyên kết quả
 *
 * @param eligibility Kết quả evaluateEligibility của con ngựa
 * @param intensity Cường độ của buổi tập
 * @returns Điều kiện tập của con ngựa cho riêng buổi tập này
 */
export function eligibilityForSession(
  eligibility: EligibilityResult,
  intensity: TrainingIntensity,
): EligibilityResult {
  const underObservation = eligibility.reasons.includes(
    EligibilityReason.HEALTH_UNDER_OBSERVATION,
  );
  if (!underObservation || intensity === TrainingIntensity.LIGHT) {
    return eligibility;
  }
  return {
    ...eligibility,
    trainingEligible: false,
    trainingReasons: [
      ...eligibility.trainingReasons,
      EligibilityReason.HEALTH_UNDER_OBSERVATION,
    ],
  };
}

/**
 * Chọn trạng thái ban đầu và lý do không đủ điều kiện cho một lượt tập mới tạo.
 *
 * - Được tập: PLANNED, lý do null
 * - Đang bị khóa huấn luyện: CANCELLED_BY_LOCK; không được tập vì lý do khác: INELIGIBLE
 * - Lý do là trainingReasons nối bằng dấu phẩy, tối đa 64 ký tự
 *
 * @param eligibility Kết quả evaluateEligibility của con ngựa
 * @param hasActiveTrainingLock true nếu ngựa đang có lệnh khóa huấn luyện ACTIVE
 * @returns Trạng thái và lý do để gán vào lượt tập
 */
export function initialParticipantEligibility(
  eligibility: EligibilityResult,
  hasActiveTrainingLock: boolean,
): {
  status: SessionParticipantStatus;
  ineligibilityReason: string | null;
} {
  if (eligibility.trainingEligible) {
    return {
      status: SessionParticipantStatus.PLANNED,
      ineligibilityReason: null,
    };
  }
  return {
    status: hasActiveTrainingLock
      ? SessionParticipantStatus.CANCELLED_BY_LOCK
      : SessionParticipantStatus.INELIGIBLE,
    ineligibilityReason:
      eligibility.trainingReasons.join(',').slice(0, 64) || null,
  };
}

/**
 * Chặn ghi danh ngựa không ở trạng thái ACTIVE vào lớp.
 *
 * @param lifecycleStatus Trạng thái vòng đời hiện tại của ngựa
 * @throws ConflictException Nếu ngựa không ở trạng thái ACTIVE
 */
export function assertHorseEnrollable(
  lifecycleStatus: HorseLifecycleStatus,
): void {
  if (lifecycleStatus === HorseLifecycleStatus.RETIRED) {
    throw new ConflictException('Ngựa đã giải nghệ, không học lớp');
  }
  if (isReadOnlyLifecycle(lifecycleStatus)) {
    throw new ConflictException(READ_ONLY_ENROLL_MESSAGES[lifecycleStatus]);
  }
}

/**
 * Kiểm nội dung bài tập của môn học theo loại buổi
 *
 * - Môn chạy thử: cự ly phải lớn hơn 0
 * - Môn thường: không có thời gian mục tiêu
 *
 * @param sessionType Loại buổi của môn
 * @param plannedDistanceM Cự ly dự kiến (mét)
 * @param targetTimeMs Thời gian mục tiêu (ms), null nếu không có
 * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
 */
export function assertSubjectExercise(
  sessionType: TrainingSessionType,
  plannedDistanceM: number,
  targetTimeMs: number | null,
): void {
  if (sessionType === TrainingSessionType.TIME_TRIAL && plannedDistanceM <= 0) {
    throw new BadRequestException('Môn chạy thử phải có cự ly lớn hơn 0');
  }
  if (sessionType === TrainingSessionType.REGULAR && targetTimeMs !== null) {
    throw new BadRequestException('Chỉ môn chạy thử mới có thời gian mục tiêu');
  }
}

/**
 * Tính tổng số tuần của giáo án
 *
 * @param items Các môn của giáo án kèm số tuần
 * @returns Tổng số tuần
 */
export function totalPlanWeeks(
  items: ReadonlyArray<{ weeks: number }>,
): number {
  return items.reduce((sum, item) => sum + item.weeks, 0);
}

/**
 * Tính ngày kết thúc của lớp theo ngày bắt đầu và tổng số tuần của giáo án
 *
 * - Ngày kết thúc = ngày bắt đầu + tổng số tuần × 7 − 1 ngày
 *
 * @param startDate Ngày bắt đầu dạng YYYY-MM-DD
 * @param totalWeeks Tổng số tuần của giáo án, lớn hơn 0
 * @returns Ngày kết thúc dạng YYYY-MM-DD
 */
export function classEndDate(startDate: string, totalWeeks: number): string {
  const end = new Date(`${dateOnly(startDate)}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + totalWeeks * 7 - 1);
  return end.toISOString().slice(0, 10);
}

/**
 * Chỉ thêm hoặc sửa buổi tập khi lớp đang chạy
 *
 * @param status Trạng thái của lớp
 * @throws ConflictException Nếu lớp đã hoàn thành hoặc đã hủy
 */
export function assertClassOpenForSessions(status: TrainingClassStatus): void {
  if (status !== TrainingClassStatus.ACTIVE) {
    throw new ConflictException(
      'Lớp đã kết thúc, không thêm hoặc sửa buổi tập được',
    );
  }
}

/**
 * Thời gian cho phép sửa số liệu đã ghi của buổi tập (video, thời gian, ghi chú chạy thử, đánh giá) kể từ giờ kết thúc dự kiến của buổi (7 ngày)
 */
export const SESSION_RECORD_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Chỉ cho sửa số liệu đã ghi của buổi tập khi buổi chưa hủy và chưa quá hạn
 *
 * - Áp dụng cho video, thời gian, ghi chú chạy thử và điểm, nhận xét đánh giá
 * - Buổi đã hủy: 409
 * - Quá giờ kết thúc dự kiến của buổi cộng 7 ngày: 409; đúng mốc đó vẫn còn được sửa
 *
 * @param sessionStatus Trạng thái của buổi tập
 * @param scheduledEndAt Giờ kết thúc dự kiến của buổi tập
 * @param now Thời điểm hiện tại
 * @throws ConflictException Nếu buổi đã hủy hoặc đã quá hạn sửa
 */
export function assertSessionRecordEditable(
  sessionStatus: TrainingSessionStatus,
  scheduledEndAt: Date,
  now: Date,
): void {
  if (sessionStatus === TrainingSessionStatus.CANCELLED) {
    throw new ConflictException('Buổi tập đã hủy, không sửa kết quả được');
  }
  if (
    now.getTime() >
    scheduledEndAt.getTime() + SESSION_RECORD_EDIT_WINDOW_MS
  ) {
    throw new ConflictException('Quá hạn sửa kết quả buổi tập');
  }
}

/**
 * Tìm giai đoạn của lớp chứa một ngày, theo các giai đoạn nối tiếp nhau từ ngày bắt đầu của lớp
 *
 * - Mỗi tuần 7 ngày; giai đoạn sắp theo `position`
 * - Ngày trước ngày bắt đầu hoặc sau giai đoạn cuối: undefined
 *
 * @param classStartDate Ngày bắt đầu của lớp dạng YYYY-MM-DD
 * @param phases Các giai đoạn của lớp
 * @param date Ngày cần xét dạng YYYY-MM-DD (lịch CLB)
 * @returns Giai đoạn chứa ngày đó, hoặc undefined
 */
export function classPhaseOn<T extends { position: number; weeks: number }>(
  classStartDate: string,
  phases: ReadonlyArray<T>,
  date: string,
): T | undefined {
  const days =
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${dateOnly(classStartDate)}T00:00:00Z`)) /
    86_400_000;
  if (days < 0) return undefined;
  let weekEnd = 0;
  for (const phase of [...phases].sort((a, b) => a.position - b.position)) {
    weekEnd += phase.weeks;
    if (days < weekEnd * 7) return phase;
  }
  return undefined;
}

/**
 * Kiểm lượt tập còn mở và buổi chưa hủy
 *
 * @param run Lượt tập cần xét
 * @returns true nếu lượt còn tính vào lịch dắt của Groom
 */
function isOpenGroomRun(run: GroomRun): boolean {
  return (
    OPEN_GROOM_RUN_STATUSES.includes(run.status) &&
    run.sessionStatus !== TrainingSessionStatus.CANCELLED
  );
}
