# Câu hỏi cho Flow 2 (sau merge `anh` → `truong`, 2026-09-28)

Người hỏi: Trường (Flow 1). Mỗi câu có phương án A/B, bạn chọn hoặc ghi cách khác.

## 1. Đánh giá buổi tập (`performance_evaluations`) còn làm không?

Bối cảnh:
- Merge đã xóa module `trainging-evaluations`, hiện không còn API nào ghi đánh giá.
- Migration `1789816000000-TrainingClassParticipantRefactor` đổi cột `session_id` → `legacy_session_id` và thêm `session_participant_id`. Nhưng `PerformanceEvaluationEntity` vẫn map `session_id`, tức entity lệch DB: query nào đụng bảng này sẽ lỗi `column "session_id" does not exist`.
- Module performance đọc "đánh giá mới nhất" qua `@Optional()` không có provider, nên luôn trả `[]`. Màn hiệu suất của ngựa không bao giờ có đánh giá.

Ví dụ: HT chấm Winx 8/10 sau buổi tập ngày 01/10 → hiện không có chỗ nào ghi, và tab hiệu suất của Winx cũng không hiện.

- **A.** Còn làm: đánh giá theo từng lượt ngựa (`session_participant_id`). Flow 2 sửa entity, làm lại API ghi và export hàm `listLatestByHorse(manager, horseId)` cho performance gọi.
- **B.** Bỏ hẳn: xóa entity/bảng, performance bỏ phần "đánh giá mới nhất" khỏi response.

## 2. Spec `training-access.service.spec.ts` lỗi type

`new TrainingAccessService({} as DataSource)` thiếu tham số thứ hai (`HorseAccessService`). Jest vẫn xanh (ts-jest bỏ qua lỗi kiểu), nhưng `tsc --noEmit` báo lỗi.

- **A.** Bạn sửa spec, truyền thêm `{} as HorseAccessService`.
- **B.** Để mình sửa.

## 3. `package.json` có 2 key `check:module-architecture`

- Key 1: `node scripts/check-module-architecture.cjs` (bản của bạn). Hiện đang pass.
- Key 2: `node scripts/check-module-architecture.mjs` (bản của mình). Hiện báo lỗi racing/performance chưa tách feature module.

JSON trùng key thì lấy key sau, tức `pnpm check:module-architecture` đang chạy bản `.mjs`.

- **A.** Giữ `.cjs`, xóa key `.mjs` và file `.mjs`.
- **B.** Giữ `.mjs`, rồi tách racing/performance cho pass.
