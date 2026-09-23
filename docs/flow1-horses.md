# Flow 1 — Quản lý hồ sơ ngựa, khu chuồng, ô chuồng và Groom

## 1. Mục tiêu

Flow này quản lý vòng đời một con ngựa trong câu lạc bộ: Club Manager tạo hồ sơ và xếp khu chuồng, Head Trainer phụ trách khu xếp ô và phân công Groom, các vai trò chuyên môn ghi chỉ số cơ thể, cho tới khi ngựa giải nghệ, chuyển nhượng hoặc được kích hoạt lại. Đặc tả nghiệp vụ gốc nằm ở `docs/Flow_1_Quan_ly_Ho_so_Ngua.md` (mã chức năng F1.1–F1.8).

Các khái niệm chính:

- `Horse`: hồ sơ ngựa. Có hai trạng thái độc lập là `lifecycleStatus` (vòng đời) và `healthStatus` (sức khỏe).
- Chủ sở hữu: mỗi ngựa có nhiều nhất một chủ, lưu ở cột `horses.owner_id`. Không có tỷ lệ, không có chủ đại diện, không lưu lịch sử sở hữu.
- Khu chuồng: lưu ở cột `horses.barn_id`, do Club Manager xếp. Khu quyết định Head Trainer nào phụ trách con ngựa (`barns.head_trainer_id`).
- `HorseMeasurement`: một bản ghi đo cân nặng, chiều cao, điểm thể trạng hoặc thân nhiệt, có nguồn `MANUAL` hoặc `MEDICAL_EXAM`.
- `Stall` và `StallAssignment`: ô chuồng và lịch sử ngựa ở ô nào. Ô phải thuộc đúng khu của ngựa.
- `GroomAssignment`: lịch sử Groom phụ trách ngựa. Groom gắn theo con ngựa, không theo ô hay khu.
- Không còn ngựa tham chiếu. Cha mẹ không có hồ sơ tại câu lạc bộ thì để trống.

### Cấu trúc triển khai

Module Horses được chia theo capability:

- `horse-profiles`: danh sách, tạo, xem, sửa, link ảnh, phả hệ, eligibility, permission flags, danh sách ngựa của Owner.
- `horse-deletions`: xóa mềm và khôi phục hồ sơ (F1.8).
- `horse-statuses`: đổi lifecycle (kèm cascade), xem trước hệ quả đổi lifecycle, đổi health.
- `horse-placements`: xếp và đổi khu chuồng (F1.6).
- `horse-measurements`: ghi, xem, xóa chỉ số đo và sinh cảnh báo.
- `shared` (`HorsesSharedModule`, module khác cũng import): phần dùng chung.
  - `HorseAccessService`: lấy người gọi; tìm ngựa theo phạm vi xem (`findReadable`, `findReadableHorse`, 404); tìm/khóa ngựa trước khi ghi (`lockWritableHorse`, `findWritableHorse`: hồ sơ đã xóa trả 403 cho CM, 404 cho role khác); phạm vi HT theo khu (`isHorseInTrainerBarn`, `assertTrainerBarn`); chặn ngựa `TRANSFERRED`.
  - `HorsePedigreeService` + `HorsePedigreeRepository`: khóa phả hệ, kiểm cha mẹ, vòng lặp, đổi giới tính và ngày sinh (tính cả con đã xóa hồ sơ).
  - `HorsesSharedRepository`: tìm ngựa, row lock, training lock, Groom được giao, chủ còn hoạt động, chỉ số mới nhất. Chỉ ĐỌC bảng module khác; ghi bảng module khác luôn qua hàm module đó export.

`HorsesModule` chỉ lắp ráp năm feature module, không export gì. Các rule thuần túy (bảng chuyển trạng thái, cascade, câu tóm tắt hệ quả, eligibility, permission, field được sửa, luật phả hệ, luật đo, trạng thái xếp chỗ) nằm trong `policies/horse.policy.ts` dưới dạng hàm `assert*` ném exception hoặc hàm tính trả giá trị. Hằng số nằm trong `constants/horse.constants.ts`. Response luôn qua mapper trong `mappers/`. DTO chia theo feature trong `dto/` và import qua `dto/index.ts`.

Thông báo đi qua domain event, phát SAU commit bằng `DomainEventPublisher`; module notifications nghe và gửi, lỗi gửi chỉ ghi log:

| Event | Phát ở | Người nhận |
| --- | --- | --- |
| `horse.barn.assigned` | Tạo ngựa kèm khu, xếp/đổi khu | HT khu mới |
| `horse.groom.released-by-transfer` | Chuyển nhượng làm kết thúc Groom | Groom cũ |
| `horse.measurement.alert` | Ghi chỉ số chạm ngưỡng | VET + HT khu |
| `stable.groom-assignment.changed` | Giao, đổi Groom | Groom mới, Groom cũ |

Phần chuồng trại nằm trong module Stable:

- `stable/barns`: CRUD khu, `GET /barns` kèm số chỗ còn nhận ngựa, và hàm `lockAssignableBarn` cho module horses gọi.
- `stable/stalls`: CRUD ô, xếp và chuyển ô (`PUT /horses/:id/stall`), kết thúc xếp ô, hàm `releaseStallByHorse`.
- `stable/groom-assignments`: giao, đổi Groom, khối lượng việc của Groom, hàm `endGroomByHorse` (chuyển nhượng gọi).

Các hàm export mà Flow 1 gọi trong transaction của mình (không tự mở transaction):

| Hàm                                                 | Module        | Dùng ở                                          |
| --------------------------------------------------- | ------------- | ----------------------------------------------- |
| `BarnsService.lockAssignableBarn`                   | stable        | Tạo ngựa kèm `barnId`, xếp khu                  |
| `StallsService.releaseStallByHorse`                 | stable        | Đổi khu, chuyển nhượng                          |
| `GroomAssignmentsService.endGroomByHorse`           | stable        | Chuyển nhượng                                   |
| `TrainingLockService.releaseActiveLockByHorse`      | medical       | Chuyển nhượng                                   |
| `RacingRepository.withdrawOpenRegistrationsByHorse` | racing        | Giải nghệ, chuyển nhượng từ `ACTIVE`            |
| `MediaService.assertAttachableHorsePhoto`           | media         | Tạo, sửa ngựa kèm `mediaId` (gọi TRƯỚC transaction vì có HEAD tới storage) |
| `MediaService.signDownloadUrl`                      | media         | `GET /horses/:horseId/photo-url`                |

## 2. Vai trò và quyền

Viết tắt: CM = `CLUB_MANAGER`, HT = `HEAD_TRAINER`, VET = `VETERINARIAN`, OWNER = `HORSE_OWNER`.

| Hành động                                                              | CM                    | HT                  | VET   | GROOM          | OWNER                |
| ---------------------------------------------------------------------- | --------------------- | ------------------- | ----- | -------------- | -------------------- |
| Xem danh sách, chi tiết, phả hệ, eligibility, permissions              | Có, kể cả đã xóa      | Có                  | Có    | Có             | Chỉ ngựa mình sở hữu |
| Tạo ngựa                                                               | Có                    | Không               | Không | Không          | Không                |
| Sửa hồ sơ (định danh, ảnh, cha mẹ, chủ)                                | Có                    | Không               | Không | Không          | Không                |
| Sửa sở trường cự ly (`raceAptitude`)                                   | Không (403)           | Ngựa thuộc khu mình | Không | Không          | Không                |
| Tải ảnh đại diện ngựa                                                  | Có                    | Không               | Không | Không          | Không                |
| Đổi lifecycle, xem trước hệ quả; xóa mềm, khôi phục hồ sơ              | Có                    | Không               | Không | Không          | Không                |
| Đổi health                                                             | Không                 | Không               | Có    | Không          | Không                |
| Xếp, đổi khu chuồng                                                    | Có                    | Không               | Không | Không          | Không                |
| Xem danh sách khu (`GET /barns`)                                       | Có                    | Có                  | Có    | Có             | Không                |
| Xếp, chuyển ô chuồng                                                   | Không                 | Ngựa thuộc khu mình | Không | Không          | Không                |
| Kết thúc xếp ô (`POST /stall-assignments/:id/end`)                     | Không                 | Ngựa thuộc khu mình | Không | Không          | Không                |
| Xem ô chuồng và lịch sử xếp ô                                          | Có                    | Có                  | Có    | Có             | Không                |
| Tạo, sửa, xóa ô chuồng                                                 | Có                    | Không               | Không | Không          | Không                |
| Giao, đổi Groom                                                        | Không                 | Ngựa thuộc khu mình | Không | Không          | Không                |
| Xem lịch sử Groom của ngựa                                             | Có                    | Có                  | Có    | Có             | Không                |
| Xem khối lượng việc của Groom                                          | Có                    | Có                  | Không | Không          | Không                |
| Ghi chỉ số đo (cả bốn loại)                                            | Không                 | Ngựa thuộc khu mình | Có    | Ngựa được giao | Không                |
| Xóa chỉ số đo                                                          | Không                 | Không               | Có    | Không          | Không                |
| Xem chỉ số đo                                                          | Có, kể cả ngựa đã xóa | Có                  | Có    | Có             | Chỉ ngựa mình sở hữu |
| Tab Bệnh án, Huấn luyện (cờ `canViewMedicalTab`, `canViewTrainingTab`) | Có                    | Có, toàn câu lạc bộ | Có    | Không          | Có                   |
| Tab Thành tích (`canViewPerformanceTab`)                               | Có                    | Có                  | Không | Không          | Có                   |

Phạm vi dữ liệu:

- Hệ thống chỉ có một câu lạc bộ, không có cột club hay tenant. CM, HT, VET và GROOM xem được toàn bộ ngựa chưa xóa.
- OWNER chỉ thấy ngựa có `horses.owner_id` là mình, kể cả ngựa đã chuyển nhượng. Ngựa khác trả `404 Không tìm thấy ngựa` để không lộ sự tồn tại.
- Hồ sơ đã xóa mềm chỉ CM xem được (chi tiết, phả hệ, eligibility, permissions, chỉ số đo, danh sách với `includeDeleted=true`). Vai trò khác nhận `404`.
- Thao tác ghi trên hồ sơ đã xóa (sửa hồ sơ, xóa lần nữa, đổi khu, đổi vòng đời, đổi health, ghi/xóa chỉ số): CM nhận `403 Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác` (xem được nhưng không được làm, III.6.3); vai trò khác nhận `404`. Dùng chung qua `HorseAccessService.lockWritableHorse` / `findWritableHorse`.
- "Ngựa thuộc khu của HT" nghĩa là `horses.barn_id` trỏ tới một khu chưa xóa có `head_trainer_id` là HT đó (`isHorseInTrainerBarn`). Khu lấy theo `horses.barn_id`, không suy ra từ ô chuồng. Ngựa chưa có khu thì không HT nào thao tác được.
- `assertTrainerBarn` bỏ qua giới hạn khu nếu người gọi có thêm vai trò CM. Riêng `PUT /horses/:id/stall` và `PUT /horses/:id/groom` luôn kiểm HT phụ trách khu, kể cả khi người gọi có thêm vai trò khác.
- "Ngựa được giao cho GROOM" nghĩa là có dòng `groom_assignments` đang mở (`end_at IS NULL`) cho Groom đó.
- Người có nhiều vai trò được hợp quyền: chỉ cần một vai trò đủ điều kiện.

`GET /horses/:horseId/permissions` trả các cờ để UI ẩn hoặc hiện nút. Các API ghi vẫn tự kiểm tra quyền, không dựa vào cờ này.

## 3. State machine

### Lifecycle

```text
          ┌────retire────> RETIRED ──transfer──┐
ACTIVE ───┤                   │                ├──> TRANSFERRED
          │ <──reactivate─────┘                │          │
          └───────────transfer─────────────────┘          │
   ^                                                      │
   └──────────────────────buy back────────────────────────┘
```

Bảng chuyển (`LIFECYCLE_TRANSITIONS`):

| Từ            | Được sang                |
| ------------- | ------------------------ |
| `ACTIVE`      | `RETIRED`, `TRANSFERRED` |
| `RETIRED`     | `ACTIVE`, `TRANSFERRED`  |
| `TRANSFERRED` | `ACTIVE`                 |

- Ngựa mới tạo luôn là `ACTIVE` và `ELIGIBLE`; client không chọn được hai giá trị này.
- Mọi lần đổi phải có `reason`. Hệ thống lưu `lifecycleReason` và `lifecycleChangedAt`.
- Kích hoạt lại (sang `ACTIVE` từ `RETIRED` hoặc `TRANSFERRED`) đặt `healthStatus = UNDER_OBSERVATION` cho tới khi bác sĩ khám lại. Giáo án, đăng ký đua đã hủy không tự khôi phục.
- Kích hoạt lại từ `TRANSFERRED`: ngựa vào "Chờ xếp khu". Chủ cũ không còn là `HORSE_OWNER` đang `ACTIVE` thì bỏ trống chủ (khóa chia sẻ row tài khoản khi kiểm), nhật ký ghi `ownerId` trước/sau (quyết định 2026-09-23).
- Nhật ký đổi vòng đời ghi thêm `trainingPlansCancelled` (số giáo án bị hủy) khi có hủy giáo án.
- Ngựa `TRANSFERRED` chỉ được xem. Sửa hồ sơ, đổi health, xếp khu, xếp ô, giao Groom, ghi hoặc xóa chỉ số và xóa hồ sơ đều trả `409`. Chỉ còn CM đổi lifecycle để kích hoạt lại.
- Ngựa kích hoạt lại từ `TRANSFERRED` không có khu (đã bị bỏ lúc chuyển nhượng), nên vào danh sách "Chờ xếp khu".

### Health

Có 4 giá trị: `ELIGIBLE`, `UNDER_OBSERVATION`, `INJURED`, `QUARANTINED`.

- Không có bảng chuyển; VET đặt được bất kỳ giá trị nào.
- Không được đặt `ELIGIBLE` khi ngựa còn `TrainingLock` đang `ACTIVE`. Cần giải khóa ở module Medical trước.
- `QUARANTINED` chỉ là trạng thái y tế, không bắt buộc chuyển ô.

### Trạng thái xếp chỗ (`placementStatus`)

Tính lúc đọc từ lifecycle, `horses.barn_id` và dòng xếp ô đang mở (`placementStatusOf`), không lưu DB:

| Giá trị          | Khi nào                   | Nhãn UI     |
| ---------------- | ------------------------- | ----------- |
| `NOT_APPLICABLE` | Lifecycle `TRANSFERRED`   | —           |
| `PENDING_BARN`   | Chưa có khu               | Chờ xếp khu |
| `PENDING_STALL`  | Có khu, chưa có ô đang mở | Chờ xếp ô   |
| `PLACED`         | Có khu và ô               | —           |

### Ô chuồng

```text
AVAILABLE ──xếp ngựa──> OCCUPIED ──chuyển ô / kết thúc xếp / đổi khu / TRANSFERRED──> AVAILABLE
```

Ô mới luôn `AVAILABLE` (tạo ô không nhận `status`). `PATCH /stalls/:id` chỉ đổi được `AVAILABLE` ↔ `MAINTENANCE`, ô đang có ngựa trả `409`. `OCCUPIED`/`AVAILABLE` do xếp và gỡ ngựa quyết. Không còn trạng thái `RESERVED`. Chỉ ô `AVAILABLE` và không có dòng xếp đang mở mới nhận ngựa. Khi đóng dòng xếp, ô chỉ quay về `AVAILABLE` nếu đang `OCCUPIED`; ô ở trạng thái khác giữ nguyên.

## 4. Cascade khi đổi lifecycle

`PATCH /horses/:horseId/lifecycle-status` chạy trong một database transaction và khóa row ngựa (`pessimistic_write`). Thứ tự xử lý:

1. Ngựa tồn tại và chưa bị xóa (`404`).
2. Trạng thái mới trùng trạng thái hiện tại thì không ghi gì (không cập nhật `reason`, không ghi audit), trả hồ sơ hiện tại.
3. Cặp chuyển phải nằm trong bảng ở mục 3, nếu không trả `409 Không thể chuyển vòng đời từ <from> sang <to>`.
4. Chạy cascade theo bảng dưới (`lifecycleSideEffects`).
5. Cập nhật lifecycle, `lifecycleReason`, `lifecycleChangedAt` (và `barnId`, `healthStatus` nếu có) rồi ghi audit kèm `reason`.

Ngựa đang có buổi tập hoặc cuộc đua `IN_PROGRESS` vẫn giải nghệ, chuyển nhượng được (BA chốt). Client nên gọi `GET .../lifecycle-status/preview` để hiện câu tóm tắt `summary` và bảng hệ quả cho CM xác nhận trước.

| Tác động                                                                                               | `ACTIVE` → `RETIRED` | `ACTIVE` → `TRANSFERRED` | `RETIRED` → `TRANSFERRED` | → `ACTIVE` |
| ------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------ | ------------------------- | ---------- |
| Hủy giáo án `SCHEDULED`/`ACTIVE` và buổi tập `SCHEDULED` của giáo án (ghi `cancelledAt`/`By`/`Reason`) | Có                   | Có                       | Không                     | Không      |
| Đăng ký `PROPOSED`/`OWNER_APPROVED`/`MANAGER_CONFIRMED` trong race `PLANNED`/`OPEN` → `WITHDRAWN`      | Có                   | Có                       | Không                     | Không      |
| Đóng dòng xếp ô đang mở, trả ô `OCCUPIED` về `AVAILABLE`                                               | Không                | Có                       | Có                        | Không      |
| Đóng Groom assignment đang mở                                                                          | Không                | Có                       | Có                        | Không      |
| Bỏ khu (`barnId = null`)                                                                               | Không                | Có                       | Có                        | Không      |
| Gỡ `TrainingLock` đang `ACTIVE` (`releasedBy = null`, `releaseConclusion = "Gỡ do chuyển nhượng"`)     | Không                | Có                       | Có                        | Không      |
| Đặt `healthStatus = UNDER_OBSERVATION`                                                                 | Không                | Không                    | Không                     | Có         |

- Lý do hủy giáo án và buổi tập là ghi chú hệ thống `Ngựa giải nghệ: <reason>` hoặc `Ngựa chuyển nhượng: <reason>`.
- Chủ sở hữu luôn được giữ, để chủ cũ vẫn tra cứu được ngựa đã chuyển nhượng.
- Ngựa `RETIRED` giữ khu, ô, Groom và lịch chăm sóc y tế.
- **Tạm dừng chờ Flow 2:** đặc tả yêu cầu "rút ngựa khỏi lớp" (buổi chưa diễn ra biến mất, buổi đã học giữ nguyên). Hệ thống chưa có mô hình lớp học nhiều ngựa, nên hiện vẫn hủy cả giáo án đang mở qua `HorseStatusesRepository.cancelOpenTrainingPlans` (module horses tự ghi bảng training). Xem `docs/Flow_1_Quan_ly_Ho_so_Ngua.md` (Phụ lục 2: Việc còn nợ khi triển khai) mục 1.

## 5. Eligibility

`GET /horses/:horseId/eligibility` trả hai cờ, trạng thái hiện tại và danh sách lý do. Cả hai cờ tính lại mỗi lần đọc (`evaluateEligibility`), không lưu DB:

- `trainingEligible`: hồ sơ chưa xóa, lifecycle `ACTIVE`, health `ELIGIBLE` hoặc `UNDER_OBSERVATION`, và không có training lock `ACTIVE`.
- `racingEligible`: hồ sơ chưa xóa, lifecycle `ACTIVE`, health `ELIGIBLE`, và không có training lock `ACTIVE`.

Giá trị của `reasons` (có thể nhiều lý do cùng lúc):

| Lý do                      | Khi nào                                                  |
| -------------------------- | -------------------------------------------------------- |
| `PROFILE_DELETED`          | Hồ sơ đã xóa mềm (chỉ CM thấy)                           |
| `LIFECYCLE_RETIRED`        | Lifecycle `RETIRED`                                      |
| `LIFECYCLE_TRANSFERRED`    | Lifecycle `TRANSFERRED`                                  |
| `HEALTH_UNDER_OBSERVATION` | Health `UNDER_OBSERVATION`; chỉ chặn đua, không chặn tập |
| `HEALTH_INJURED`           | Health `INJURED`                                         |
| `HEALTH_QUARANTINED`       | Health `QUARANTINED`                                     |
| `ACTIVE_TRAINING_LOCK`     | Có `TrainingLock` đang `ACTIVE`                          |

Danh sách ngựa dùng cùng logic để tính `canRegisterRace` (bằng `racingEligible`). Chi tiết hồ sơ trả nguyên khối `eligibility { trainingEligible, racingEligible, reasons }`.

## 6. API hồ sơ ngựa

Tất cả endpoint dùng prefix `/api/v1` và yêu cầu Bearer access token. `ValidationPipe` bật `transform`, `whitelist` và `forbidNonWhitelisted`, nên field lạ trong body trả `400`. Path id không phải UUID cũng trả `400`. Tài khoản không tồn tại hoặc không `ACTIVE` trả `403`.

### `GET /horses`

Danh sách ngựa có phân trang.

Quyền: mọi role. OWNER chỉ thấy ngựa mình sở hữu.

Query:

| Tham số                                                     | Ý nghĩa                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `page`, `limit`                                             | Mặc định `1` và `20`, `limit` tối đa `100`                                                |
| `search`                                                    | Tìm theo tên (không phân biệt dấu, dùng `unaccent`) hoặc microchip, tối đa 160 ký tự      |
| `healthStatus`, `lifecycleStatus`, `gender`, `raceAptitude` | Lọc theo enum                                                                             |
| `barnId`                                                    | Ngựa có `horses.barn_id` là khu này                                                       |
| `placementStatus`                                           | `PENDING_BARN` ("Chờ xếp khu"), `PENDING_STALL` ("Chờ xếp ô"), `PLACED`, `NOT_APPLICABLE` |
| `myBarns`                                                   | `true`: "Khu của tôi", ngựa thuộc các khu người gọi làm Head Trainer                      |
| `myHorses`                                                  | `true`: "Ngựa tôi phụ trách", ngựa người gọi đang là Groom phụ trách                      |
| `includeDeleted`                                            | `true` để gộp thêm hồ sơ đã xóa (chỉ CM), mỗi dòng có `isDeleted`                         |
| `sortBy`                                                    | `HEALTH_PRIORITY` (mặc định) hoặc `NAME` (collation tiếng Việt)                           |
| `sortOrder`                                                 | `ASC` (mặc định) hoặc `DESC`                                                              |

`HEALTH_PRIORITY` + `ASC` đưa `INJURED`/`QUARANTINED` lên đầu, rồi `UNDER_OBSERVATION`, rồi các ngựa còn lại; cùng nhóm thì luôn sắp theo tên A→Z. Các query boolean chỉ nhận `true`/`false`, giá trị khác trả `400`.

Mỗi phần tử gồm hồ sơ (`HorseResponseDto`), `location { barn { id, name } | null, stall { id, code } | null, placementStatus }`, `canRegisterRace` và `isDeleted`. Với OWNER, `barn` và `stall` không có key `id`, chỉ có tên khu và mã ô.

Lỗi đáng chú ý: `403 Không có quyền xem hồ sơ đã xóa` khi role khác CM dùng `includeDeleted=true`.

### `GET /owners/me/horses`

Danh sách ngựa caller đang là chủ (`owner_id`), kể cả ngựa đã chuyển nhượng, không gồm hồ sơ đã xóa, sắp theo tên.

Quyền: `HORSE_OWNER`.

### `POST /horses`

Tạo hồ sơ ngựa. Có thể gắn ảnh, cha mẹ, chủ và xếp khu ngay trong cùng transaction.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "name": "Sao Mai",
  "gender": "FEMALE",
  "breed": "Thoroughbred",
  "color": "Nâu",
  "microchipId": "985141000123456",
  "dateOfBirth": "2022-03-15",
  "sireId": "00000000-0000-0000-0000-000000000001",
  "damId": "00000000-0000-0000-0000-000000000002",
  "mediaId": "00000000-0000-0000-0000-000000000003",
  "ownerId": "00000000-0000-0000-0000-000000000005",
  "barnId": "00000000-0000-0000-0000-000000000010"
}
```

Chỉ `name` (1–160 ký tự) và `gender` (`MALE`, `FEMALE`, `GELDING`) là bắt buộc. `breed` tối đa 80, `color` tối đa 40, `microchipId` tối đa 80 ký tự.

Rule:

- `dateOfBirth` có dạng `YYYY-MM-DD` và không được sau ngày hiện tại theo giờ `Asia/Ho_Chi_Minh` (`400 Ngày sinh không được ở tương lai`).
- `microchipId` (đã trim) không được trùng với ngựa nào khác, **kể cả hồ sơ đã xóa hoặc đã chuyển nhượng** (`409 Microchip đã được dùng cho ngựa khác`).
- `ownerId`: phải là user role `HORSE_OWNER` đang `ACTIVE` (`400 Chủ sở hữu phải là tài khoản HORSE_OWNER đang hoạt động`).
- `mediaId`: phải qua `assertAttachableHorsePhoto` (mục 12).
- Phả hệ (dưới advisory lock `horses.pedigree`), vi phạm trả `400`:
  - Sire và dam phải tồn tại và chưa xóa (`Sire không tồn tại`, `Dam không tồn tại`), được chọn cả ngựa `RETIRED`/`TRANSFERRED`.
  - Sire và dam khác nhau (`Sire và dam không được trùng nhau`).
  - Sire là `MALE` hoặc `GELDING` (`Sire phải là ngựa đực`); dam là `FEMALE` (`Dam phải là ngựa cái`).
  - Nếu cả hai bên có ngày sinh thì cha mẹ phải sinh trước con (`Cha/mẹ phải sinh trước ngựa con`).
- `barnId`: khu được khóa row và phải qua `lockAssignableBarn` (mục 8). Không gửi thì ngựa vào "Chờ xếp khu".
- Ghi audit `CREATE` (feature `F1.2`). Sau commit, nếu có khu thì báo Head Trainer khu đó.

Kết quả: `201` cùng `HorseResponseDto`.

### `GET /horses/:id`

Tab thông tin hồ sơ (F1.3, nhóm 1).

Quyền: mọi role, theo phạm vi ở mục 2.

Ngoài hồ sơ, response có `location`, `groom { id, fullName } | null`, `owner { id, fullName } | null`, `latestMeasurements[]` (mỗi loại một bản mới nhất, có `unit` và `isAbnormal`), `activeTrainingLock`, `eligibility` và `isDeleted`. Mọi vai trò nhận cùng nhóm thông tin; chỉ khác ở chỗ OWNER không nhận `id` của khu và ô.

### `PATCH /horses/:id`

Sửa hồ sơ, dùng optimistic locking.

Quyền: `CLUB_MANAGER` sửa định danh, ảnh, cha mẹ, chủ; `HEAD_TRAINER` chỉ sửa `raceAptitude` của ngựa thuộc khu mình.

Body:

```json
{
  "version": 3,
  "microchipId": "985141000123456",
  "ownerId": null
}
```

Field được gửi: `name`, `gender`, `breed`, `color`, `raceAptitude`, `microchipId`, `dateOfBirth`, `sireId`, `damId`, `mediaId`, `ownerId` (`null` để bỏ trống chủ). Không sửa được `barnId` ở đây. `version` là bắt buộc (số nguyên ≥ 1).

Rule:

- Hồ sơ đã xóa: CM nhận `403 Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác`, HT nhận `404`. Ngựa `TRANSFERRED` trả `409 Ngựa đã chuyển nhượng, hồ sơ chỉ được xem`.
- Người không có vai trò CM luôn bị kiểm khu, kể cả khi body chỉ có `version`: HT ngoài khu trả `403 Ngựa không thuộc khu bạn phụ trách`.
- `ownerId` được kiểm TRONG transaction ghi, có khóa chia sẻ row tài khoản chủ (`FOR SHARE`), để module users không đổi role hoặc khóa tài khoản đó chen vào giữa.
- Người không có vai trò CM gửi field khác `raceAptitude`: `403 Huấn luyện viên trưởng chỉ được sửa sở trường cự ly, không được sửa: <danh sách field>`.
- Gửi `raceAptitude` mà không có vai trò HT (kể cả CM): `403 Chỉ Huấn luyện viên trưởng phụ trách khu mới được sửa sở trường cự ly` (BA chốt). HT ngoài khu: `403 Ngựa không thuộc khu bạn phụ trách`.
- `version` lệch với DB trả `409 Hồ sơ ngựa vừa được người khác cập nhật, hãy tải lại để xem bản mới nhất`. Kiểm tra hai lần: trước khi mở transaction và trong câu `UPDATE ... WHERE version = :version`.
- Không có field nào thực sự đổi thì trả hồ sơ hiện tại, không ghi.
- `dateOfBirth`, `microchipId`, `ownerId`, `mediaId` áp dụng lại rule như lúc tạo.
- Khi đổi `gender`, `sireId`, `damId` hoặc `dateOfBirth`, hệ thống lấy khóa phả hệ và kiểm tra thêm:
  - Ngựa đang là sire không được đổi thành `FEMALE` (`409 Ngựa đang là sire của ngựa khác, không thể đổi thành FEMALE`); ngựa đang là dam phải giữ `FEMALE` (`409 Ngựa đang là dam của ngựa khác, phải giữ giới tính FEMALE`). `MALE` → `GELDING` luôn được.
  - Ngựa không là cha/mẹ của chính nó (`400`), không tạo vòng lặp phả hệ (`409 Quan hệ cha/mẹ tạo thành vòng lặp phả hệ`), kiểm tra tường minh bằng CTE đệ quy, không dựa vào ngày sinh.
  - Ngày sinh mới phải trước ngày sinh của con sớm nhất (`400 Cha/mẹ phải sinh trước ngựa con`).
- Đổi chủ: chủ cũ mất quyền xem ngay khi lưu, chủ mới thấy toàn bộ lịch sử. Audit ghi `ownerId` trước và sau.
- Ghi audit `UPDATE` (feature `F1.4`) với giá trị trước và sau của các field đã đổi.

Kết quả: `200` cùng `HorseResponseDto` (có `version` mới).

### `DELETE /horses/:id`

Xóa mềm hồ sơ tạo nhầm.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "reason": "Nhập trùng hồ sơ"
}
```

`reason` được trim, dài 1–500 ký tự.

Rule:

- Chạy trong transaction, lấy khóa phả hệ rồi khóa row ngựa.
- Ngựa không tồn tại hoặc đã xóa: `404`. Ngựa `TRANSFERRED`: `409`.
- Ngựa không được có dòng nào (kể cả dòng đã đóng, đã hủy hoặc đã xóa mềm) trong 12 bảng `HORSE_BUSINESS_TABLES`: bệnh án, lịch chăm sóc y tế, lệnh khóa huấn luyện, chỉ số cơ thể, xếp ô chuồng, phân công groom, giáo án huấn luyện, đăng ký thi đấu, khẩu phần ăn, checklist hằng ngày, báo cáo sự cố, ngưỡng hiệu suất. Vi phạm trả `409 Ngựa đã phát sinh dữ liệu nghiệp vụ (<các nhãn>), hãy đổi trạng thái vòng đời thay vì xóa`.
- Ngựa không được đang là sire hoặc dam của ngựa khác (`409 Ngựa đang là cha/mẹ trong phả hệ của ngựa khác, không thể xóa`).
- Lưu `deletedReason`, xóa mềm, ghi audit `DELETE` kèm `reason` (feature `F1.8`). Microchip vẫn bị coi là đã dùng.

Kết quả: `204`.

### `POST /horses/:horseId/restore`

Khôi phục hồ sơ đã xóa, trở về trạng thái trước khi xóa. Ngựa có khu thì kiểm lại khu bằng `BarnsService.lockAssignableBarn` trong cùng transaction: khu còn nhận được thì giữ; khu hết chỗ, ngừng hoạt động, không còn HT đang hoạt động hoặc đã bị xóa (409/404) thì bỏ khu (`barnId = null`), ngựa vào "Chờ xếp khu" (BA chốt 2026-09-23). Audit `RESTORE` ghi thêm `barnId` trước/sau khi khu bị bỏ.

Quyền: `CLUB_MANAGER`.

Body: `{ "reason": "..." }` (trim, 1–500 ký tự).

Rule:

- Khóa row ngựa kể cả hồ sơ đã xóa. Không có hồ sơ: `404`. Hồ sơ chưa bị xóa: `409 Hồ sơ ngựa chưa bị xóa`.
- Chỉ bỏ `deletedAt` và `deletedReason`; lifecycle, health, phả hệ giữ nguyên.
- Khu: như đoạn trên. Chủ: nếu chủ không còn là `HORSE_OWNER` đang `ACTIVE` thì bỏ trống chủ (`ownerId = null`), CM chọn chủ mới sau (quyết định 2026-09-23).
- Phả hệ không cần kiểm lại: trong lúc hồ sơ bị xóa, cha mẹ không đổi được giới tính hay ngày sinh trái với con đã xóa (luật phả hệ tính cả con đã xóa), và hồ sơ đã xóa không được chọn làm cha mẹ.
- Ghi audit `RESTORE` kèm `reason` (feature `F1.8`); khu hoặc chủ bị bỏ trống thì ghi cả giá trị cũ.

Kết quả: `200` cùng `HorseResponseDto`.

### `GET /horses/:horseId/pedigree`

Cây tổ tiên 3 đời: con ngựa đang xem, cha mẹ (đời 1), ông bà (đời 2).

Quyền: mọi role, theo phạm vi ở mục 2.

Không có tham số. `depth` trong response luôn là `2` (`PEDIGREE_DEPTH`). Mỗi node luôn có `id`, `name`, `canOpen`, `generation`, `parentRole` (`SIRE`/`DAM`), `childId` để dựng cây. Khi `canOpen = true` có thêm `gender`, `breed`, `color`, `dateOfBirth`, `raceAptitude`. Tổ tiên đã xóa bị bỏ qua. OWNER chỉ có `canOpen = true` với tổ tiên mình sở hữu; tổ tiên khác chỉ có tên và vị trí trong cây, không có key các field còn lại (F1.3.3, III.6.2).

### `GET /horses/:horseId/permissions`

Trả các cờ cho UI (`evaluateHorsePermissions`):

| Cờ                                             | Bật khi                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `canEditProfile`, `canAssignBarn`, `canDelete` | CM, hồ sơ chưa xóa, ngựa chưa `TRANSFERRED`                                 |
| `canEditRaceAptitude`                          | HT thuộc khu, hồ sơ chưa xóa, ngựa chưa `TRANSFERRED`                       |
| `canAssignStallAndGroom`                       | HT thuộc khu, ngựa đã có khu, chưa xóa, chưa `TRANSFERRED`                  |
| `canChangeLifecycle`                           | CM, hồ sơ chưa xóa (kể cả ngựa `TRANSFERRED` để kích hoạt lại)              |
| `canRestore`                                   | CM, hồ sơ đã xóa                                                            |
| `canChangeHealth`, `canDeleteMeasurement`      | VET, hồ sơ chưa xóa, ngựa chưa `TRANSFERRED`                                |
| `canRecordMeasurement`                         | Hồ sơ chưa xóa, chưa `TRANSFERRED`, và VET / HT thuộc khu / GROOM được giao |
| `canViewMedicalTab`, `canViewTrainingTab`      | CM, HT, VET, OWNER. API `GET /horses/:id/training-plans` cũng chặn GROOM (403) |
| `canViewPerformanceTab`                        | CM, HT, OWNER                                                               |

`canDelete` chỉ để hiện nút; API xóa vẫn chặn nếu ngựa đã có dữ liệu nghiệp vụ hoặc là cha/mẹ.

### `GET /horses/:horseId/eligibility`

Xem mục 5. Response: `horseId`, `trainingEligible`, `racingEligible`, `healthStatus`, `lifecycleStatus`, `activeTrainingLock`, `reasons`.

## 7. API trạng thái

### `GET /horses/:horseId/lifecycle-status/preview?lifecycleStatus=RETIRED`

Xem trước hệ quả đổi vòng đời để hiện bảng xác nhận (F1.8 mục 5). Không ghi gì.

Quyền: `CLUB_MANAGER`.

Query `lifecycleStatus` bắt buộc. Ngựa không tồn tại trả `404`. Hồ sơ đã xóa trả `403` (giống lúc đổi thật, phải khôi phục trước).

Response:

```json
{
  "horseId": "00000000-0000-0000-0000-000000000001",
  "from": "ACTIVE",
  "to": "RETIRED",
  "allowed": true,
  "blockedReason": null,
  "trainingPlansCancelled": 2,
  "raceRegistrationsWithdrawn": 1,
  "stallReleased": null,
  "groomEnded": null,
  "barnCleared": null,
  "trainingLockReleased": false,
  "healthResetTo": null,
  "pendingBarnAfter": false,
  "ownerCleared": null,
  "summary": "Winx đang có 2 giáo án huấn luyện đang mở, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ hủy giáo án, rút khỏi giải."
}
```

- `allowed = false` khi trạng thái đích trùng hiện tại (`blockedReason = "Ngựa đang ở đúng trạng thái này"`) hoặc ngoài bảng chuyển. Khi đó `summary = null`.
- `stallReleased` là mã ô, `groomEnded` là tên Groom, `barnCleared` là tên khu sẽ bị bỏ; `null` nếu không áp dụng.
- `summary` (`lifecycleImpactSummary`) chỉ nhắc mục thật sự có dữ liệu. Câu 1 liệt kê ngựa đang có gì, câu 2 bắt đầu bằng `Nếu <giải nghệ | chuyển nhượng | kích hoạt lại> sẽ ...`. Không có gì bị ảnh hưởng thì còn `Nếu <động từ> sẽ không ảnh hưởng dữ liệu nào khác.` Kích hoạt lại luôn có vế `đặt sức khỏe về Cần theo dõi tới khi bác sĩ khám lại`; kích hoạt lại từ `TRANSFERRED` có thêm vế `đưa ngựa vào danh sách Chờ xếp khu (cần xếp lại khu, ô chuồng và Groom)`, và khi chủ không còn hợp lệ thì thêm `bỏ trống chủ <tên> vì tài khoản không còn là chủ ngựa đang hoạt động`.
- `pendingBarnAfter = true` khi kích hoạt lại từ `TRANSFERRED`. `ownerCleared` là tên chủ sẽ bị bỏ trống, `null` nếu giữ chủ.

### `PATCH /horses/:horseId/lifecycle-status`

Đổi vòng đời.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "lifecycleStatus": "RETIRED",
  "reason": "Chấn thương gân, không thi đấu tiếp"
}
```

`reason` được trim, dài 1–500 ký tự. Rule và cascade ở mục 3 và 4.

Lỗi đáng chú ý:

- `404`: ngựa không tồn tại hoặc đã xóa.
- `409 Không thể chuyển vòng đời từ <from> sang <to>`: cặp chuyển không hợp lệ (thực tế chỉ còn `TRANSFERRED` → `RETIRED`).

Kết quả: `200` cùng `HorseResponseDto`.

### `PATCH /horses/:horseId/health-status`

Đổi tình trạng sức khỏe.

Quyền: `VETERINARIAN`.

Body:

```json
{
  "healthStatus": "UNDER_OBSERVATION"
}
```

Chạy trong transaction và khóa row ngựa.

Lỗi đáng chú ý:

- `404`: ngựa không tồn tại hoặc đã xóa.
- `409 Ngựa đã chuyển nhượng, hồ sơ chỉ được xem`.
- `409 Ngựa đang bị khóa huấn luyện, cần giải khóa trước khi chuyển sang ELIGIBLE`.

Kết quả: `200` cùng `HorseResponseDto`. Không ghi audit (xem mục 16).

## 8. API khu chuồng

Danh mục khu, ô và việc gán Head Trainer cho khu là dữ liệu dùng chung với Flow 2 (`POST`/`PATCH`/`DELETE /barns`, chỉ CM). Flow 1 chỉ xếp ngựa vào khu.

Sửa và xóa khu (quyết định 2026-09-23): chạy trong transaction, khóa row khu. Khi khu còn ngựa (`horses.barn_id` là khu, hồ sơ chưa xóa) thì `409` nếu:

- đổi `status` sang `CLOSED` hoặc `MAINTENANCE` (`409 Khu chuồng còn ngựa, không chuyển sang <status> được. Vui lòng chuyển ngựa sang khu khác trước`);
- gỡ Head Trainer (`409 Khu chuồng còn ngựa, không gỡ Head Trainer phụ trách được`);
- xóa khu (`409 Không thể xóa khu chuồng khi vẫn còn ngựa`). Khu còn ô cũng không xóa được.

Với mọi khu (còn ngựa hay không): không hạ `capacity` xuống dưới số ô hiện có (`409 Khu chuồng đang có <n> ô chuồng, không hạ sức chứa xuống <m> được. Vui lòng xóa bớt ô trước`).

Sửa khu ghi audit entity `BARN` (feature `F1.6`) với các field thực sự đổi; xóa khu ghi `DELETE`.

"Khu còn nhận được ngựa" (`lockAssignableBarn`, BA chốt):

- Ô trống: ô chưa xóa, `AVAILABLE`, không có dòng xếp ô đang mở.
- Ngựa chờ xếp ô của khu: `horses.barn_id` là khu, chưa xóa mềm, lifecycle khác `TRANSFERRED` (tính cả `RETIRED`), không có dòng xếp ô đang mở.
- Số chỗ còn nhận = ô trống − ngựa chờ xếp ô, không nhỏ hơn 0. Phải còn ít nhất 1 chỗ.

### `GET /barns`

Danh sách khu, sắp theo tên.

Quyền: CM, HT, VET, GROOM.

Mỗi phần tử gồm `id`, `name`, `description`, `capacity`, `status`, `headTrainerId`, `headTrainerFullName` (tên người đang được gán, kể cả khi tài khoản đã bị khóa), `hasActiveHeadTrainer` (HT còn ACTIVE, tức khu xếp ngựa được), `availableStallCount` (số chỗ còn nhận theo công thức trên; `0` nghĩa là không xếp thêm ngựa được) và `pendingStallHorseCount`.

### `PUT /horses/:horseId/barn`

Xếp hoặc đổi khu cho ngựa (F1.6).

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "barnId": "00000000-0000-0000-0000-000000000010",
  "reason": "Cân bằng số ngựa giữa các khu"
}
```

`reason` được trim, dài 1–500 ký tự.

Rule:

- Chạy trong transaction, khóa row ngựa. Ngựa không tồn tại hoặc đã xóa: `404`. Ngựa `TRANSFERRED`: `409 Ngựa đã chuyển nhượng, hồ sơ chỉ được xem`. Ngựa `ACTIVE` và `RETIRED` đều xếp được.
- Chọn đúng khu đang ở thì không đổi gì, không gửi thông báo.
- Khóa row khu rồi kiểm tra:
  - Khu không tồn tại hoặc đã xóa: `404 Không tìm thấy khu chuồng`.
  - Khu không `ACTIVE`: `409 Khu chuồng không ở trạng thái hoạt động`.
  - Khu chưa có HT: `409 Khu chuồng chưa có Head Trainer phụ trách, không xếp ngựa vào được`.
  - Hết chỗ: `409 Khu chuồng đã hết ô trống, vui lòng chọn khu khác`, hoặc khi có ngựa đang chờ: `409 Khu chuồng đã hết chỗ: <n> ô trống nhưng đã có <m> ngựa chờ xếp ô, vui lòng chọn khu khác`.
- Đổi khu: đóng dòng xếp ô đang mở và trả ô cũ về trống (`releaseStallByHorse`), cập nhật `barnId`; ngựa vào "Chờ xếp ô" của khu mới. Groom giữ nguyên.
- Ghi audit `UPDATE` entity `HORSE` (feature `F1.6`) với `before { barnId, stallCode }`, `after { barnId, stallCode: null }` và `reason`.
- Sau commit: báo Head Trainer khu mới (mục 14).
- **Tạm dừng chờ Flow 2:** chưa rút ngựa khỏi lớp của Head Trainer khu cũ; giáo án cũ vẫn chạy.

Kết quả: `200` cùng `HorseResponseDto`.

## 9. API chỉ số đo

Các loại chỉ số (`HORSE_MEASUREMENT_SPECS`):

| Type             | Đơn vị    | Khoảng hợp lệ | Khoảng bình thường |
| ---------------- | --------- | ------------- | ------------------ |
| `WEIGHT`         | `kg`      | 30–1500       | 400–600            |
| `HEIGHT`         | `cm`      | 50–250        | 150–175            |
| `BODY_CONDITION` | `score`   | 1–9           | 4–6                |
| `TEMPERATURE`    | `celsius` | 30–45         | 37.2–38.3          |

Giá trị ngoài khoảng hợp lệ bị từ chối. Giá trị ngoài khoảng bình thường vẫn lưu được nhưng phải xác nhận (`confirmAbnormal`), và luôn được đánh dấu `isAbnormal = true` khi đọc. Bản ghi đo không có API sửa; ghi sai thì VET xóa rồi đo lại.

### `GET /horses/:horseId/measurements?type=WEIGHT`

Liệt kê chỉ số chưa xóa, `measuredAt` mới nhất trước, tối đa 200 dòng, không phân trang. `type` không bắt buộc.

Quyền: mọi role, theo phạm vi ở mục 2 (CM xem được cả ngựa đã xóa).

Mỗi dòng: `id`, `horseId`, `type`, `value` (chuỗi 2 chữ số thập phân), `unit`, `measuredAt`, `isAbnormal`, `measuredBy`, `measuredByName`, `source`.

### `POST /horses/:horseId/measurements`

Ghi một lần đo, gồm một hoặc nhiều loại chỉ số.

Quyền: `HEAD_TRAINER` (ngựa thuộc khu mình), `VETERINARIAN` (mọi ngựa), `GROOM` (ngựa được giao). Ai được ghi thì ghi được cả bốn loại.

Body:

```json
{
  "values": [
    { "type": "TEMPERATURE", "value": 38.9 },
    { "type": "WEIGHT", "value": 470 }
  ],
  "measuredAt": "2026-09-20T06:30:00+07:00",
  "confirmAbnormal": true
}
```

Rule:

- `values` có 1–4 phần tử, mỗi `value` tối đa 2 chữ số thập phân. Mỗi loại chỉ một giá trị (`400 Mỗi loại chỉ số chỉ ghi một giá trị trong một lần đo`).
- Chạy trong transaction, khóa row ngựa. Ngựa không tồn tại, đã xóa hoặc ngoài phạm vi: `404`. Ngựa `TRANSFERRED`: `409`. Ngựa `RETIRED` vẫn ghi được.
- Không được ghi cho ngựa này: `403 Bạn không được ghi chỉ số cho con ngựa này`.
- Giá trị ngoài khoảng hợp lệ: `400 <TYPE> phải trong khoảng <min>–<max> <unit>`.
- `measuredAt` mặc định là hiện tại. Sau hiện tại quá 60 giây: `400 Thời điểm đo không được ở tương lai`. Lùi quá 7 ngày: `400 Chỉ được nhập lùi tối đa 7 ngày`.
- Có giá trị ngoài khoảng bình thường mà `confirmAbnormal` không phải `true`: `422 Giá trị ngoài khoảng bình thường (<các type>). Gửi lại với confirmAbnormal = true để xác nhận lưu`. Chưa lưu gì.
- Mỗi giá trị lưu thành một bản ghi `source = MANUAL` và một dòng audit `CREATE` (feature `F1.5`).

Cảnh báo (mỗi bản ghi có tối đa một cảnh báo):

| Alert         | Severity  | Điều kiện                                                                         | Thông báo |
| ------------- | --------- | --------------------------------------------------------------------------------- | --------- |
| `FEVER`       | `URGENT`  | `TEMPERATURE` > 38.6                                                              | `URGENT`  |
| `WEIGHT_DROP` | `WARNING` | `WEIGHT` thấp hơn quá 5% so với mức cân cao nhất trong 14 ngày trước `measuredAt` | `HIGH`    |

Mốc cân nặng bỏ qua bản ghi đã xóa. `WEIGHT_DROP` kèm `baselineValue` và `dropPercent`; với `FEVER` hai field này là `null`.

Kết quả: `201` cùng mảng bản ghi vừa tạo, mỗi bản ghi kèm `alerts[]`. Sau commit, mỗi cảnh báo phát một event `horse.measurement.alert` (mục 14).

### `DELETE /horses/:horseId/measurements/:measurementId`

Xóa mềm một bản ghi đo sai.

Quyền: `VETERINARIAN`.

Body: `{ "reason": "..." }` (trim, 1–500 ký tự).

Rule:

- Chạy trong transaction, khóa row ngựa rồi khóa bản ghi đo. Ngựa `TRANSFERRED`: `409`.
- Bản ghi không tồn tại, đã xóa hoặc thuộc ngựa khác: `404 Không tìm thấy bản ghi đo`.
- Bản ghi `source = MEDICAL_EXAM`: `409 Bản ghi đến từ buổi khám, cần xử lý ở hồ sơ y tế`.
- Lưu `deleteReason`, `deletedBy`, xóa mềm, ghi audit `DELETE` entity `HORSE_MEASUREMENT` kèm `reason` (feature `F1.5`).

Kết quả: `204`.

## 10. API ô chuồng và xếp ô

### `GET /stalls`

Danh sách ô chưa xóa, sắp theo `code`. Query lọc `barnId`, `status`, `type`.

Quyền: CM, HT, VET, GROOM.

### `POST /stalls`

Tạo ô chuồng.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "barnId": "00000000-0000-0000-0000-000000000010",
  "code": "A-01",
  "type": "STANDARD",
  "description": "Gần cửa phía đông",
  "hasCamera": true
}
```

`code` 1–80 ký tự. `type` mặc định `STANDARD` (khác: `ISOLATION`, `RECOVERY`, `FOALING`). Không nhận `status`: ô mới luôn `AVAILABLE`. `hasCamera` mặc định `false`. Chạy trong transaction, khóa row khu trước khi đếm sức chứa.

Rule:

- Khu phải tồn tại (`404 Không tìm thấy khu chuồng`) và đang `ACTIVE` (`400 Khu chuồng không ở trạng thái hoạt động`).
- Nếu khu có `capacity`, số ô chưa xóa phải còn chỗ (`409 Khu chuồng đã đạt sức chứa tối đa (<n> ô chuồng)`).
- `code` (đã trim) không trùng ô chưa xóa (`409 Mã ô chuồng đã tồn tại`).

Kết quả: `201`.

### `GET /stalls/:id`

Chi tiết ô chuồng. Quyền: CM, HT, VET, GROOM.

### `PATCH /stalls/:id`

Sửa một phần các field của endpoint tạo.

Quyền: `CLUB_MANAGER`.

Khi đổi `barnId`, khu mới phải tồn tại, `ACTIVE` và còn chỗ; khóa khu nguồn và khu đích theo UUID tăng dần rồi mới khóa ô (cùng thứ tự khu → ô với xếp ô); ô đang có ngựa không đổi khu được (`409 Ô chuồng đang có ngựa, không đổi khu chuồng được`). `status` chỉ nhận `AVAILABLE` hoặc `MAINTENANCE`; ô đang có ngựa trả `409 Ô chuồng đang có ngựa, không đổi trạng thái được`, ô đang `OCCUPIED` trả `409 Ô chuồng đang OCCUPIED, chỉ được đổi giữa AVAILABLE và MAINTENANCE`.

Ô đang trống mà chuyển sang `MAINTENANCE` hoặc sang khu khác: nếu khu hiện tại không còn đủ ô trống cho ngựa chờ xếp ô thì `409 Khu còn <n> ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước` (quyết định 2026-09-23). Thêm, sửa, xóa ô ghi audit entity `STALL` (feature `F1.7`); thêm khu ghi audit `BARN` `CREATE`.

### `DELETE /stalls/:id`

Xóa mềm ô chuồng.

Quyền: `CLUB_MANAGER`.

Chạy trong transaction, khóa khu rồi khóa ô trước khi kiểm (cùng thứ tự với xếp ô nên hai việc không chen nhau). Ô trống bị xóa cũng áp luật "không làm khu thiếu ô cho ngựa chờ xếp ô". Ô đang có ngựa trả `409 Không thể xóa ô chuồng đang có ngựa phân công`. Kết quả: `204`.

### `GET /stalls/:id/assignments`

Lịch sử xếp ô của ô, kèm `horse { id, name }`, sắp theo `startAt` giảm dần. Quyền: CM, HT, VET, GROOM.

### `PUT /horses/:id/stall`

Xếp ngựa vào ô, hoặc chuyển sang ô khác trong cùng khu (F1.7).

Quyền: `HEAD_TRAINER` phụ trách khu của ngựa.

Body:

```json
{
  "stallId": "00000000-0000-0000-0000-000000000004"
}
```

Rule (theo đúng thứ tự kiểm tra):

1. Khóa row ngựa. Không có hoặc đã xóa: `404 Không tìm thấy ngựa`.
2. Ngựa chưa có khu: `409 Ngựa chưa được xếp khu chuồng, vui lòng liên hệ Club Manager để xếp khu trước`.
3. Người gọi không phụ trách khu của ngựa: `403 Ngựa không thuộc khu bạn phụ trách`.
4. Ngựa `TRANSFERRED`: `409 Ngựa đã chuyển nhượng, không xếp ô chuồng được`. Ngựa `RETIRED` vẫn xếp được.
5. Khu không `ACTIVE`: `400 Khu chuồng không ở trạng thái hoạt động`.
6. Khóa dòng xếp ô đang mở của ngựa. Chọn lại đúng ô đang ở thì trả dòng hiện tại, không ghi.
7. Khóa row ô đích. Không có: `404 Không tìm thấy ô chuồng`. Ô không thuộc khu của ngựa: `400 Ô chuồng không thuộc khu chuồng của ngựa`. Ô không `AVAILABLE` hoặc đã có ngựa: nếu khu không còn ô trống nào thì `409 Khu đã hết ô trống, đề nghị Club Manager đổi khu cho ngựa` (F1.7 E4), còn không thì `409 Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống`.
8. Đóng dòng cũ (nếu có) và trả ô cũ về `AVAILABLE`, mở dòng mới với `startAt` là giờ server, chuyển ô đích sang `OCCUPIED`.
9. Ghi audit entity `STALL_ASSIGNMENT` (feature `F1.7`): `UPDATE` cho dòng cũ bị đóng, `CREATE` cho dòng mới (kèm `stallCode`, `previousStallId`).

Không đụng tới Groom, giáo án hay lịch tập. Hai request đồng thời vi phạm unique index trả `409 Ô vừa bị chiếm, vui lòng tải lại sơ đồ ô trống` hoặc `409 Ngựa vừa được xếp vào ô khác, vui lòng tải lại`.

Kết quả: `200` cùng dòng xếp ô đang mở `{ id, stallId, horseId, horse, startAt, endAt }`.

### `POST /stall-assignments/:id/end`

Chỉ HT phụ trách khu của ngựa (theo `horses.barn_id`); người có thêm role CM vẫn bị kiểm khu. CM không gọi được (F1.7: CM không xếp ô). Chạy trọn trong một transaction: khóa dòng xếp ô, kiểm khu (`403 Ngựa không thuộc khu bạn phụ trách`), dòng đã kết thúc trả `409`, đóng dòng và khóa ô trước khi đổi status (ô chỉ về `AVAILABLE` khi đang `OCCUPIED` và không còn dòng mở nào khác). Ghi audit `UPDATE` entity `STALL_ASSIGNMENT` (feature `F1.7`, before/after gồm `horseId`, `stallId`, `stallCode`, `endAt`). Dòng không tồn tại: `404 Không tìm thấy lượt phân công chuồng`. Kết quả: `200`.

### `GET /horses/:id/grooms`

Lịch sử Groom của ngựa, kèm `groom { id, fullName, email }`, sắp theo `startAt` giảm dần. Phạm vi xem theo `findReadable`: CM xem được cả ngựa đã xóa; role khác nhận `404` với ngựa không có hoặc đã xóa.

Quyền: CM, HT, VET, GROOM.

### `GET /grooms/workload`

Mọi Groom đang `ACTIVE` kèm `activeHorseCount` (số ngựa chưa xóa đang phụ trách trên toàn câu lạc bộ), nhiều nhất đứng trước, rồi theo tên. Groom chưa phụ trách ngựa nào vẫn có mặt với `0`. Chỉ để HT tham khảo, không chặn giao thêm.

Quyền: CM, HT.

### `PUT /horses/:id/groom`

Giao hoặc đổi Groom.

Quyền: `HEAD_TRAINER` phụ trách khu của ngựa.

Body:

```json
{
  "groomId": "00000000-0000-0000-0000-000000000020"
}
```

Rule:

- Trong transaction, khóa row user rồi kiểm `groomId` là user role `GROOM` đang `ACTIVE` (`400 Groom phụ trách không hợp lệ hoặc không ở trạng thái hoạt động`).
- Khóa row ngựa. Kiểm tra theo thứ tự: không có hoặc đã xóa (`404`), chưa có khu (`409 Ngựa chưa được xếp khu chuồng, vui lòng liên hệ Club Manager để xếp khu trước`), không phụ trách khu (`403 Ngựa không thuộc khu bạn phụ trách`), `TRANSFERRED` (`409 Ngựa đã chuyển nhượng, không giao groom được`). Ngựa `RETIRED` vẫn giao được.
- Khu của ngựa phải đang `ACTIVE`, giống luật xếp ô (`400 Khu chuồng không ở trạng thái hoạt động`; quyết định 2026-09-23).
- Trùng Groom hiện tại thì trả dòng đang có, không ghi, không thông báo.
- Khác: đóng dòng cũ, mở dòng mới (giờ server), chuyển checklist chưa hoàn thành từ hôm nay (giờ câu lạc bộ) trở đi của Groom cũ sang Groom mới. Groom mới đã có checklist cùng ngày cho ngựa này thì trả `409 Groom mới đã có checklist của ngựa này vào ngày <ngày>, không chuyển được checklist chưa hoàn thành của groom cũ`.
- Ghi audit `CREATE` entity `GROOM_ASSIGNMENT` (feature `F1.7`), kèm Groom cũ và `movedChecklistIds`.
- Sau commit: phát event `stable.groom-assignment.changed`, module notifications báo Groom mới và Groom cũ (mục 14).
- Hai request đồng thời vi phạm unique index: `409 Ngựa vừa được giao groom khác, vui lòng tải lại`.
- **Tạm dừng chờ Flow 2:** chưa chuyển các đầu việc buổi tập tương lai sang Groom mới; chỉ chuyển checklist hằng ngày.

Kết quả: `200` cùng dòng phân công đang mở.

Không có API gỡ Groom mà không giao ai (bỏ ngày 2026-09-23 theo F1.7: chỉ giao và đổi Groom, ngựa luôn có Groom phụ trách). Groom chỉ tự kết thúc khi ngựa chuyển nhượng.

## 12. Ảnh đại diện ngựa

Ảnh là một field của hồ sơ (`mediaId`, cột `photo_asset_id`). Tải ảnh đi qua module Media với presigned URL:

1. `POST /media/upload-requests` với `{ "purpose": "HORSE_PHOTO", "fileName", "mimeType", "byteSize" }`.
   - Chỉ `CLUB_MANAGER` (BA chốt). Role khác: `403 Chỉ Quản lý câu lạc bộ được tải lên ảnh đại diện ngựa`.
   - `mimeType` phải là `image/jpeg`, `image/png` hoặc `image/webp` (`400 Ảnh đại diện phải có định dạng JPEG, PNG hoặc WebP`); `byteSize` tối đa 10 MB (`400 Ảnh đại diện không được vượt quá 10 MB`).
   - Trả `assetId` và presigned PUT URL ký kèm `Content-Type`, `Content-Length`.
2. Client `PUT` tệp lên storage.
3. `POST /media/:id/complete` (chỉ người tải lên) để kiểm lại metadata thật trên storage.
4. Gửi `mediaId` trong `POST /horses` hoặc `PATCH /horses/:id`. Trước khi mở transaction, `assertAttachableHorsePhoto` kiểm tra:
   - Tệp do chính người gọi tải lên, nếu không trả `404 Không tìm thấy tệp`.
   - Tệp được xin với mục đích `HORSE_PHOTO` (`400 Tệp không phải ảnh đại diện ngựa`).
   - Tệp đã có trên storage (`409 Tệp chưa được tải lên storage`), đúng định dạng, dung lượng và khớp số liệu khai báo (`400`).

Xem ảnh ngựa: `GET /horses/:horseId/photo-url` trả `{ "url": "<presigned GET URL>" }`. Ai xem được hồ sơ ngựa (theo `findReadable`) thì lấy được link; ngựa chưa có ảnh hoặc ngoài phạm vi trả `404`. Module horses quyết quyền, media chỉ ký link.

`GET /media/:id`, `GET /media/:id/download-url` giờ chỉ cho người đã tải tệp lên; người khác nhận `404`.

## 13. Mã lỗi chung

| HTTP  | Ý nghĩa                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400` | Body, UUID hoặc ngày tháng không hợp lệ; cha mẹ sai; chủ không phải Horse Owner đang hoạt động; ảnh sai định dạng; chỉ số ngoài khoảng hợp lệ; ô không thuộc khu               |
| `401` | Thiếu hoặc access token không hợp lệ                                                                                                                                           |
| `403` | Tài khoản không hoạt động; role không đủ quyền; gửi field ngoài quyền; HT ngoài khu; Groom không được giao ngựa; CM thao tác ghi trên hồ sơ đã xóa                             |
| `404` | Không tìm thấy tài nguyên; OWNER xem ngựa không sở hữu; role khác CM xem hồ sơ đã xóa                                                                                          |
| `409` | Chuyển trạng thái không hợp lệ; ngựa `TRANSFERRED`; `version` lệch; trùng microchip hoặc mã ô; khu không nhận được ngựa; ô bị chiếm; còn dữ liệu nghiệp vụ; xung đột đồng thời |
| `422` | Có chỉ số ngoài khoảng bình thường mà chưa gửi `confirmAbnormal = true`                                                                                                        |

## 14. Transaction, lock, audit, event và thông báo

Lock:

- Advisory lock `pg_advisory_xact_lock(hashtext('horses.pedigree'))`: lấy khi tạo ngựa có cha mẹ, khi sửa field phả hệ (`gender`, `sireId`, `damId`, `dateOfBirth`), và luôn lấy khi xóa ngựa. Để hai thao tác đổi phả hệ đồng thời không cùng tạo vòng lặp.
- Row lock `pessimistic_write`:
  - Row ngựa: xóa, khôi phục (kể cả hồ sơ đã xóa), đổi lifecycle, đổi health, xếp khu, ghi và xóa chỉ số, xếp ô, giao và đổi Groom.
  - Row khu: `lockAssignableBarn` khi tạo ngựa kèm `barnId` và khi xếp khu.
  - Dòng xếp ô đang mở và row ô: xếp ô, `releaseStallByHorse`.
  - Dòng Groom đang mở và checklist cần chuyển: đổi Groom, `endGroomByHorse`.
  - Bản ghi đo: xóa chỉ số.
- Optimistic lock bằng `version`: chỉ `PATCH /horses/:id`.
- Lỗi unique `23505` được đổi sang `409` có message: `horses_microchip_uq`, `stall_assignments_active_stall_uq`, `stall_assignments_active_horse_uq`, `groom_assignments_active_horse_uq`, `daily_checklists_horse_groom_date_uq`.

Audit (ghi `audit_logs` trong cùng transaction; cột `reason` và `feature` là mới):

| Thao tác                  | Entity              | Action                                  | Feature | Có `reason` |
| ------------------------- | ------------------- | --------------------------------------- | ------- | ----------- |
| Tạo ngựa                  | `HORSE`             | `CREATE`                                | `F1.2`  | Không       |
| Sửa hồ sơ (kể cả đổi chủ) | `HORSE`             | `UPDATE`                                | `F1.4`  | Không       |
| Ghi chỉ số (mỗi bản ghi)  | `HORSE_MEASUREMENT` | `CREATE`                                | `F1.5`  | Không       |
| Xóa chỉ số                | `HORSE_MEASUREMENT` | `DELETE`                                | `F1.5`  | Có          |
| Xếp, đổi khu              | `HORSE`             | `UPDATE`                                | `F1.6`  | Có          |
| Xếp ô, chuyển ô           | `STALL_ASSIGNMENT`  | `UPDATE` (dòng cũ), `CREATE` (dòng mới) | `F1.7`  | Không       |
| Giao, đổi Groom           | `GROOM_ASSIGNMENT`  | `CREATE`                                | `F1.7`  | Không       |
| Đổi lifecycle             | `HORSE`             | `UPDATE`                                | `F1.8`  | Có          |
| Xóa ngựa                  | `HORSE`             | `DELETE`                                | `F1.8`  | Có          |
| Khôi phục ngựa            | `HORSE`             | `RESTORE`                               | `F1.8`  | Có          |
| Sửa khu                   | `BARN`              | `UPDATE`                                | `F1.6`  | Không       |
| Xóa khu                   | `BARN`              | `DELETE`                                | `F1.6`  | Không       |

Thêm, sửa, xóa khu và ô đều ghi audit (`BARN`, `STALL`). Chưa ghi audit: đổi health (Flow 3).

Event và thông báo (đều chạy sau khi transaction commit; lỗi gửi chỉ ghi log, không làm hỏng thao tác đã lưu):

- `horse.measurement.alert`: phát qua `DomainEventPublisher`, mỗi cảnh báo một event. Payload gồm `alert`, `severity`, `baselineValue`, `dropPercent` (chỉ `WEIGHT_DROP`), `measurementId`, `horseId`, `measuredBy`, `type`, `value`, `unit`, `measuredAt`. `HorseMeasurementAlertListener` (`@OnEvent`, async) gửi cho mọi VET đang `ACTIVE` và HT đang `ACTIVE` của khu hiện tại (ngựa chưa có khu thì chỉ VET). Sốt: ưu tiên `URGENT`, tiêu đề `KHẨN: Ngựa <tên> bị sốt`. Giảm cân: ưu tiên `HIGH`, tiêu đề `Cảnh báo: Ngựa <tên> giảm cân`. `eventId` là `measurementId`.
- Xếp khu (tạo ngựa kèm khu hoặc `PUT /horses/:id/barn`): phát `horse.barn.assigned`, `HorseBarnAssignedListener` gọi `notifyBarnAssigned` gửi HT của khu mới, tiêu đề `Ngựa mới vào khu phụ trách`, ưu tiên `NORMAL`. Khu chưa có HT thì không gửi.
- Giao hoặc đổi Groom: stable phát `stable.groom-assignment.changed`, `GroomAssignmentChangedListener` gọi `notifyGroomChanged` gửi Groom mới (`Phân công chăm ngựa mới`) và Groom cũ (`Kết thúc phân công chăm ngựa`), ưu tiên `NORMAL`.
- Chuyển nhượng làm kết thúc phân công Groom: phát `horse.groom.released-by-transfer`, `HorseGroomReleasedListener` gọi `notifyGroomReleasedByTransfer` gửi Groom đó (`Ngựa đã chuyển nhượng`), ưu tiên `NORMAL`, sau commit (BA chốt 2026-09-23).
- Thông báo lưu vào bảng `notifications`, idempotent theo `(eventId, recipientId)` (`ON CONFLICT DO NOTHING`). Dòng mới lưu được đẩy socket `notification.created` qua `RealtimeGateway` tới room `user:<id>` (namespace `/events`, token gửi ở `handshake.auth.token`).
- API đọc thông báo (`GET /notifications`, `GET /notifications/unread-count`, `GET /notifications/:id`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`) vẫn trả `501`.

Soft delete:

- `horses`: `deleted_at`, `deleted_reason`; khôi phục được qua `POST /horses/:horseId/restore`.
- `horse_measurements`: `deleted_at`, `delete_reason`, `deleted_by`. Bản ghi đã xóa không xuất hiện trong danh sách, chỉ số mới nhất và mốc cân nặng 14 ngày.
- `stalls`, `barns`: `deleted_at`.
- `stall_assignments`, `groom_assignments`: không xóa, chỉ đóng bằng `end_at`.

Luật đổi vai trò liên quan (module Users): user `HORSE_OWNER` chỉ bị chặn đổi vai trò khi còn là chủ của ngựa `ACTIVE`/`RETIRED` chưa xóa (`409 Người này đang là chủ của ngựa còn ở câu lạc bộ, cần đổi chủ trước khi đổi vai trò`). Chủ cũ của ngựa đã chuyển nhượng đổi vai trò được; khi không còn vai trò Horse Owner thì không xem được hồ sơ đó nữa.

## 15. Index và constraint

Unique index bảo vệ rule nghiệp vụ:

- `horses_microchip_uq (microchip_id) WHERE microchip_id IS NOT NULL`: tính cả hồ sơ đã xóa, khớp rule ở ứng dụng.
- `stall_assignments_active_stall_uq (stall_id) WHERE end_at IS NULL`: một ô một ngựa.
- `stall_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`: một ngựa một ô.
- `groom_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`: một ngựa một Groom.
- `training_locks_active_horse_uq (horse_id) WHERE status = 'ACTIVE'`: một ngựa tối đa một lệnh khóa đang hiệu lực.
- `daily_checklists_horse_groom_date_uq (horse_id, groom_id, checklist_date)`.
- `stalls_code_uq (code) WHERE deleted_at IS NULL`, `barns_name_uq (name) WHERE deleted_at IS NULL`.

Index phục vụ query:

- `horses_owner_idx (owner_id) WHERE deleted_at IS NULL`, `horses_barn_idx (barn_id) WHERE deleted_at IS NULL`.
- `horse_measurements_horse_type_measured_idx (horse_id, type, measured_at)`.
- `groom_assignments_groom_active_idx (groom_id, end_at)`.

Khóa ngoại mới: `horses_owner_fk` (→ `users`, `RESTRICT`), `horses_barn_fk` (→ `barns`, `RESTRICT`), `horse_measurements_medical_record_fk` (→ `medical_records`), `horse_measurements_deleted_by_fk` (→ `users`).

Bảng `horse_ownerships` và cột `horses.is_reference` đã bị bỏ.

Migration của flow:

| Migration                    | Nội dung                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UnaccentExtension`          | Bật extension `unaccent` cho tìm kiếm tên                                                                                                                                                                                                                                                      |
| `SplitGroomAssignments`      | Tạo `groom_assignments`, chép dữ liệu Groom từ `stall_assignments`                                                                                                                                                                                                                             |
| `DropStallAssignmentGroom`   | Bỏ cột `stall_assignments.groom_id`                                                                                                                                                                                                                                                            |
| `AddOwnershipRepresentative` | Thêm `is_representative` và unique index chủ đại diện (đã bị `Flow1HorseContract` bỏ cùng bảng)                                                                                                                                                                                                |
| `OwnershipTimestamps`        | Đổi `start_date`/`end_date` (date) thành `start_at`/`end_at` (timestamptz) cho `horse_ownerships` (đã bị bỏ cùng bảng)                                                                                                                                                                         |
| `HorseMeasurementSoftDelete` | Thêm `horse_measurements.deleted_at`                                                                                                                                                                                                                                                           |
| `HorseLifecycleReason`       | Thêm `lifecycle_reason`, `lifecycle_changed_at`, `deleted_reason` cho `horses`                                                                                                                                                                                                                 |
| `Flow1HorseExpand`           | Thêm `horses.owner_id`, `horses.barn_id` kèm index và FK; điền chủ từ dòng sở hữu mở (ưu tiên chủ đại diện, tỷ lệ cao nhất) và khu từ ô đang ở; tạo lại `horses_microchip_uq` tính cả hồ sơ đã xóa; thêm `source`, `medical_record_id`, `delete_reason`, `deleted_by` cho `horse_measurements` |
| `AuditReasonFeature`         | Thêm `audit_logs.reason` (text) và `audit_logs.feature` (varchar 16)                                                                                                                                                                                                                           |
| `Flow1HorseContract`         | Gỡ ngựa tham chiếu khỏi `sire_id`/`dam_id`, xóa mềm ngựa tham chiếu với lý do `Bỏ ngựa tham chiếu theo Flow 1 mới`, bỏ cột `is_reference` và bảng `horse_ownerships`                                                                                                                           |

## 16. Điểm còn mở

Các điểm dưới đây mô tả đúng code hiện tại nhưng chưa nhất quán hoặc chưa hoàn thiện, cần quyết định trước khi sửa:

1. **Phần chờ Flow 2** (chi tiết ở `docs/Flow_1_Quan_ly_Ho_so_Ngua.md` (Phụ lục 2: Việc còn nợ khi triển khai) mục 1): rút ngựa khỏi lớp khi đổi khu, giải nghệ, chuyển nhượng; chuyển buổi tập tương lai sang Groom mới; câu `summary` nói "lớp" thay cho "giáo án". Hiện module horses vẫn tự hủy giáo án qua `cancelOpenTrainingPlans` (ghi thẳng bảng training).
2. **`PATCH /health-status`** không kiểm tra `version` và không ghi audit. Theo đặc tả, đổi health thuộc Flow 3.
3. **Mã lỗi khu không hoạt động bị lệch**: `lockAssignableBarn` (tạo ngựa, xếp khu) trả `409`, còn `PUT /horses/:id/stall` và `POST /stalls` trả `400` cho cùng điều kiện.
4. **409 khi hai người cùng sửa hồ sơ** chưa trả kèm dữ liệu mới nhất (F1.4 mục 7), vì filter lỗi chung chỉ trả `code/message/details`.
5. **Bảng xác nhận hệ quả** (F1.8 mục 5) mới có cho đổi lifecycle; xóa và khôi phục hồ sơ chưa có API xem trước.
6. **Nguồn `MEDICAL_EXAM`**: chưa có module nào ghi chỉ số từ buổi khám vào `horse_measurements`; nhánh chặn xóa bản ghi `MEDICAL_EXAM` hiện chưa có dữ liệu thật.
7. **`AuditEntityType.HORSE_OWNERSHIP`** vẫn còn trong enum dù bảng `horse_ownerships` đã bị bỏ.
8. **`pnpm check:module-architecture` còn đỏ ở 2 chỗ (ghi nợ theo quyết định 2026-09-23):**
    - `medical` có 28 file chưa tách feature (ngưỡng 20), phần lớn là stub 501. Tách khi làm Flow 3.
    - `supplies`: `SupplyItemsService`, `SupplyRequestsService` viết sẵn nhưng chưa đăng ký provider, controller vẫn trả 501. Xử lý khi làm luồng supplies.
