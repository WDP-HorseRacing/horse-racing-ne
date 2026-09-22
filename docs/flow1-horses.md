# Flow 1 — Quản lý hồ sơ ngựa, chủ sở hữu và chuồng trại

## 1. Mục tiêu

Flow này quản lý vòng đời một con ngựa trong câu lạc bộ, từ lúc Club Manager tạo hồ sơ, xếp chuồng, gán chủ sở hữu và Groom phụ trách, ghi nhận chỉ số sức khỏe hằng ngày, đến khi ngựa giải nghệ hoặc chuyển nhượng.

Các khái niệm chính:

- `Horse`: hồ sơ ngựa. Một hồ sơ có hai trạng thái độc lập là `lifecycleStatus` (vòng đời) và `healthStatus` (sức khỏe).
- Ngựa tham chiếu (`isReference = true`): ngựa ngoài câu lạc bộ, chỉ dùng để khai báo phả hệ. Ngựa này không được xếp chuồng, gán chủ hay huấn luyện cho tới khi được activate.
- `HorseOwnership`: một dòng sở hữu có tỷ lệ phần trăm, trong khoảng thời gian nửa mở `[startAt, endAt)`. Dòng có `endAt = null` là chủ hiện tại.
- `HorseMeasurement`: một lần đo cân nặng, chiều cao, điểm thể trạng hoặc thân nhiệt.
- `Stall` và `StallAssignment`: ô chuồng, và lịch sử ngựa ở ô nào.
- `GroomAssignment`: lịch sử Groom phụ trách ngựa. Việc này tách khỏi xếp chuồng; ngựa không cần có chuồng mới được giao Groom.

### Cấu trúc triển khai

Module Horses được chia theo capability thay vì dồn nghiệp vụ vào một service:

- `horse-profiles`: danh sách, tạo, sửa, xóa, activate ngựa tham chiếu, phả hệ, eligibility và permission flags.
- `horse-statuses`: đổi lifecycle (kèm cascade) và đổi health.
- `horse-ownerships`: lịch sử chủ sở hữu, thay danh sách chủ, danh sách ngựa của Owner.
- `horse-measurements`: ghi, xem, xóa chỉ số đo và sinh cảnh báo.
- `shared`: phần dùng chung.
  - `HorseAccessService` kiểm tra actor, phạm vi xem và trạng thái ngựa.
  - `HorseOwnersService` kiểm tra và ghi các dòng sở hữu.
  - `HorsesSharedRepository` chứa query và row lock dùng chung.

`HorsesModule` chỉ làm composition root, import bốn feature module trên và chỉ export `HorsesSharedModule` cho module khác dùng. Các rule thuần túy (bảng chuyển trạng thái, tỷ lệ sở hữu, eligibility, permission, cảnh báo đo) nằm trong `policies/horse.policy.ts`. Hằng số nghiệp vụ nằm trong `constants/horse.constants.ts`.

Phần chuồng trại nằm trong module Stable:

- `stable/stalls`: CRUD ô chuồng, xếp ngựa vào chuồng và kết thúc xếp chuồng.
- `stable/groom-assignments`: giao, đổi và gỡ Groom phụ trách ngựa.

## 2. Vai trò và quyền

Viết tắt: CM = `CLUB_MANAGER`, HT = `HEAD_TRAINER`, VET = `VETERINARIAN`, OWNER = `HORSE_OWNER`.

| Hành động                                         | CM    | HT                                               | VET       | GROOM                                   | OWNER                |
| ------------------------------------------------- | ----- | ------------------------------------------------ | --------- | --------------------------------------- | -------------------- |
| Xem danh sách, chi tiết, eligibility, permissions | Có    | Có                                               | Có        | Có                                      | Chỉ ngựa đang sở hữu |
| Xem phả hệ                                        | Có    | Có                                               | Có        | Không                                   | Chỉ ngựa đang sở hữu |
| Tạo, xóa ngựa; activate ngựa tham chiếu           | Có    | Không                                            | Không     | Không                                   | Không                |
| Sửa hồ sơ                                         | Có    | Chỉ `raceAptitude`, ngựa trong barn mình         | Không     | Không                                   | Không                |
| Đổi lifecycle                                     | Có    | Không                                            | Không     | Không                                   | Không                |
| Đổi health                                        | Không | Không                                            | Có        | Không                                   | Không                |
| Xem chủ sở hữu                                    | Có    | Không                                            | Không     | Không                                   | Chỉ ngựa đang sở hữu |
| Thay danh sách chủ sở hữu                         | Có    | Không                                            | Không     | Không                                   | Không                |
| Ghi, xóa chỉ số đo                                | Không | `WEIGHT`, `BODY_CONDITION`, ngựa trong barn mình | Cả 4 loại | `WEIGHT`, `TEMPERATURE`, ngựa được giao | Không                |
| Xem chỉ số đo                                     | Có    | Có                                               | Có        | Có                                      | Chỉ ngựa đang sở hữu |
| Xem ô chuồng và lịch sử xếp chuồng                | Có    | Có                                               | Có        | Có                                      | Không                |
| Tạo, sửa, xóa ô chuồng; xếp ngựa vào chuồng       | Có    | Không                                            | Không     | Không                                   | Không                |
| Kết thúc xếp chuồng                               | Có    | Có                                               | Không     | Không                                   | Không                |
| Xem lịch sử Groom                                 | Có    | Có                                               | Có        | Có                                      | Không                |
| Giao, gỡ Groom                                    | Có    | Ngựa trong barn mình                             | Không     | Không                                   | Không                |

Phạm vi dữ liệu:

- Hệ thống chỉ có một câu lạc bộ, không có cột club hay tenant. CM, HT, VET và GROOM thấy toàn bộ ngựa của câu lạc bộ.
- OWNER chỉ thấy ngựa mình đang có dòng sở hữu mở. Ngựa khác trả `404 Không tìm thấy ngựa` để không làm lộ sự tồn tại của dữ liệu.
- Ngựa tham chiếu chỉ CM thấy; role khác nhận `404`.
- Ngựa đã soft delete chỉ CM xem được ở chi tiết, hoặc qua danh sách với `deleted=true`.
- "Ngựa trong barn của HT" nghĩa là ngựa đang có stall assignment mở ở một ô thuộc barn có `head_trainer_id` là HT đó (`stable/utils/trainer-barn.ts`). Sai điều kiện trả `403 Ngựa không thuộc khu bạn phụ trách`.
- "Ngựa được giao cho GROOM" nghĩa là có dòng `groom_assignments` mở cho Groom đó.

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

- Ngựa mới tạo (không phải tham chiếu) luôn là `ACTIVE` và `ELIGIBLE`.
- Mọi lần đổi phải có `reason`. Hệ thống lưu `lifecycleReason` và `lifecycleChangedAt`.
- Ngựa `TRANSFERRED` chỉ được xem. Sửa hồ sơ, đổi health, đổi chủ, ghi hoặc xóa chỉ số và giao Groom đều trả `409`.
- Chuyển về `ACTIVE` không tự khôi phục chuồng, chủ hay Groom; cần gán lại qua các API tương ứng.

### Health

Có 4 giá trị: `ELIGIBLE`, `UNDER_OBSERVATION`, `INJURED`, `QUARANTINED`.

- Không có bảng chuyển; VET được đặt bất kỳ giá trị nào.
- Không được đặt `ELIGIBLE` khi ngựa còn `TrainingLock` đang `ACTIVE`. Cần giải khóa ở module Medical trước.

### Ngựa tham chiếu

```text
isReference = true ──activate──> isReference = false, ACTIVE, ELIGIBLE
```

Activate là thao tác một chiều. Không có API chuyển ngược ngựa của câu lạc bộ thành ngựa tham chiếu.

### Ô chuồng

```text
AVAILABLE ──xếp ngựa──> OCCUPIED ──kết thúc xếp / TRANSFERRED──> AVAILABLE
```

`MAINTENANCE` và `RESERVED` chỉ được đặt thủ công qua tạo hoặc `PATCH /stalls/:id`. Chỉ ô `AVAILABLE` mới nhận ngựa.

## 4. Cascade khi đổi lifecycle

`PATCH /horses/:horseId/lifecycle-status` chạy trong database transaction và khóa row ngựa (`pessimistic_write`). Thứ tự xử lý:

1. Ngựa tồn tại, chưa bị xóa và không phải ngựa tham chiếu.
2. Nếu trạng thái mới trùng trạng thái hiện tại thì trả ngựa, không ghi gì (không cập nhật `reason`, không ghi audit).
3. Cặp chuyển phải nằm trong bảng ở mục 3.
4. Với `RETIRED` hoặc `TRANSFERRED`: ngựa không được có training session `IN_PROGRESS`, cũng không được có đăng ký mở trong cuộc đua `IN_PROGRESS`.
5. Chạy cascade theo bảng dưới.
6. Cập nhật lifecycle, `lifecycleReason`, `lifecycleChangedAt` và ghi audit.

| Tác động                                                                                              | → `RETIRED` | → `TRANSFERRED` | → `ACTIVE` |
| ----------------------------------------------------------------------------------------------------- | ----------- | --------------- | ---------- |
| Hủy training plan `SCHEDULED`/`ACTIVE` và session `SCHEDULED` của plan (ghi cancelledAt/By/Reason)    | Có          | Có              | Không      |
| Đăng ký đua `PROPOSED`/`OWNER_APPROVED`/`MANAGER_CONFIRMED` trong race `PLANNED`/`OPEN` → `WITHDRAWN` | Có          | Có              | Không      |
| Đóng các dòng sở hữu mở                                                                               | Không       | Có              | Không      |
| Đóng Groom assignment mở                                                                              | Không       | Có              | Không      |
| Đóng stall assignment mở, trả ô `OCCUPIED` về `AVAILABLE`                                             | Không       | Có              | Không      |
| Giải `TrainingLock` đang `ACTIVE` (`releasedBy = null`, kết luận là ghi chú hệ thống)                 | Không       | Có              | Không      |

Ghi chú hệ thống dùng cho lý do hủy là `Ngựa giải nghệ: <reason>` hoặc `Ngựa chuyển nhượng: <reason>`.

Ngựa `RETIRED` vẫn giữ chuồng, chủ sở hữu, Groom và lịch chăm sóc y tế.

## 5. Eligibility

`GET /horses/:horseId/eligibility` trả hai cờ cùng danh sách lý do:

- `trainingEligible`: lifecycle `ACTIVE`, health là `ELIGIBLE` hoặc `UNDER_OBSERVATION`, và không có training lock.
- `racingEligible`: lifecycle `ACTIVE`, health `ELIGIBLE`, và không có training lock.

Giá trị của `reasons`:

| Lý do                      | Khi nào                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `REFERENCE_HORSE`          | Ngựa tham chiếu. Chỉ trả đúng lý do này, cả hai cờ `false` |
| `LIFECYCLE_NOT_ACTIVE`     | Lifecycle khác `ACTIVE`                                    |
| `HEALTH_UNDER_OBSERVATION` | Health `UNDER_OBSERVATION`; chỉ chặn đua, không chặn tập   |
| `HEALTH_INJURED`           | Health `INJURED`                                           |
| `HEALTH_QUARANTINED`       | Health `QUARANTINED`                                       |
| `ACTIVE_TRAINING_LOCK`     | Có `TrainingLock` đang `ACTIVE`                            |

Danh sách ngựa dùng cùng logic này để tính `canRegisterRace` (bằng `racingEligible`).

## 6. API hồ sơ ngựa

Tất cả endpoint dùng prefix `/api/v1` và yêu cầu Bearer access token. Body được validate với `whitelist` và `forbidNonWhitelisted`, nên field lạ trả `400`. Path id không phải UUID cũng trả `400`.

### `GET /horses`

Danh sách ngựa có phân trang.

Quyền: mọi role. OWNER chỉ thấy ngựa mình đang sở hữu.

Query:

| Tham số                                                     | Ý nghĩa                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `page`, `limit`                                             | Mặc định `1` và `20`, `limit` tối đa `100`                                           |
| `search`                                                    | Tìm theo tên (không phân biệt dấu, dùng `unaccent`) hoặc microchip, tối đa 160 ký tự |
| `healthStatus`, `lifecycleStatus`, `gender`, `raceAptitude` | Lọc theo enum                                                                        |
| `barnId`                                                    | Ngựa đang có stall assignment mở trong barn này                                      |
| `reference`                                                 | `true` để liệt kê ngựa tham chiếu (chỉ CM). Mặc định `false`                         |
| `deleted`                                                   | `true` để liệt kê ngựa đã xóa (chỉ CM). Mặc định `false`                             |
| `sortBy`                                                    | `NAME` (mặc định, collation tiếng Việt) hoặc `HEALTH_PRIORITY`                       |
| `sortOrder`                                                 | `ASC` (mặc định) hoặc `DESC`                                                         |

`HEALTH_PRIORITY` đưa `INJURED`/`QUARANTINED` lên trước, rồi `UNDER_OBSERVATION`, rồi các ngựa còn lại, trong cùng nhóm thì sắp theo tên.

Mỗi phần tử gồm hồ sơ, `stall { id, code, barn { id, name } }` hoặc `null`, và `canRegisterRace`.

Lỗi đáng chú ý: `403` khi role khác CM dùng `reference=true` hoặc `deleted=true`.

### `POST /horses`

Tạo hồ sơ ngựa. Có thể xếp chuồng và gán chủ ngay trong cùng transaction.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "name": "Sao Mai",
  "gender": "FEMALE",
  "breed": "Thoroughbred",
  "color": "Nâu",
  "raceAptitude": "MILER",
  "microchipId": "985141000123456",
  "dateOfBirth": "2022-03-15",
  "sireId": "00000000-0000-0000-0000-000000000001",
  "damId": "00000000-0000-0000-0000-000000000002",
  "mediaId": "00000000-0000-0000-0000-000000000003",
  "isReference": false,
  "stallId": "00000000-0000-0000-0000-000000000004",
  "owners": [
    {
      "ownerId": "00000000-0000-0000-0000-000000000005",
      "percentage": 60,
      "isRepresentative": true
    },
    {
      "ownerId": "00000000-0000-0000-0000-000000000006",
      "percentage": 40
    }
  ]
}
```

Chỉ `name` (1–160 ký tự) và `gender` (`MALE`, `FEMALE`, `GELDING`) là bắt buộc.

Rule:

- Ngựa tham chiếu không được kèm `stallId` hoặc `owners` (`400`).
- `dateOfBirth` có dạng `YYYY-MM-DD` và không được sau ngày hiện tại theo giờ `Asia/Ho_Chi_Minh` (`400`).
- `microchipId` không được trùng với ngựa nào khác, **kể cả ngựa đã xóa** (`409`).
- `mediaId` phải là file ảnh (`image/*`) (`400`).
- Phả hệ (dưới advisory lock `horses.pedigree`):
  - Sire và dam phải tồn tại và khác nhau.
  - Sire là `MALE` hoặc `GELDING`; dam là `FEMALE`.
  - Cha mẹ phải sinh trước ngựa con.
  - Vi phạm trả `400`.
- `stallId`: ô được khóa row. Ô không tồn tại trả `400`; ô không `AVAILABLE`, barn không `ACTIVE` hoặc ô đang có ngựa trả `409`. Thành công thì ô chuyển sang `OCCUPIED`.
- `owners`: rule ở mục 8. Dòng sở hữu có `startAt` là thời điểm tạo.

Kết quả: `201` cùng hồ sơ vừa tạo.

### `GET /horses/:id`

Chi tiết hồ sơ ngựa.

Quyền: mọi role, theo phạm vi ở mục 2.

Ngoài hồ sơ, response còn có `stall`, `groom { id, fullName }`, `representativeOwner`, `latestMeasurements[]` (mỗi loại một bản mới nhất, có `isAbnormal`) và `activeTrainingLock`.

Field bị ẩn theo role (key không xuất hiện trong JSON):

- `sireId`, `damId`: ẩn với GROOM.
- `representativeOwner`: ẩn với VET và GROOM.

### `PATCH /horses/:id`

Sửa hồ sơ, dùng optimistic locking.

Quyền: `CLUB_MANAGER`; `HEAD_TRAINER` chỉ được sửa `raceAptitude` của ngựa trong barn mình.

Body:

```json
{
  "version": 3,
  "raceAptitude": "STAYER",
  "microchipId": "985141000123456"
}
```

Field được sửa: `name`, `gender`, `breed`, `color`, `raceAptitude`, `microchipId`, `dateOfBirth`, `sireId`, `damId`, `mediaId`. Không sửa được `isReference`, `stallId` và `owners`. `version` là bắt buộc.

Rule:

- Ngựa `TRANSFERRED` không sửa được (`409`).
- HT gửi field khác `raceAptitude` thì nhận `403`, message liệt kê các field bị cấm.
- `version` lệch với DB trả `409 Hồ sơ ngựa vừa được người khác cập nhật, hãy tải lại để xem bản mới nhất`.
- Không có gì thay đổi thì trả hồ sơ hiện tại, không ghi.
- Khi đổi `gender`, `sireId`, `damId` hoặc `dateOfBirth`, hệ thống lấy khóa phả hệ và kiểm tra thêm:
  - Ngựa đang là sire của ngựa khác không được đổi thành `FEMALE`; ngựa đang là dam phải giữ `FEMALE` (`409`).
  - Không được tạo vòng lặp phả hệ (`409`).
  - Ngày sinh mới phải trước ngày sinh của con sớm nhất (`400`).
- Ghi audit `UPDATE` với các field đã đổi.

### `DELETE /horses/:id`

Soft delete hồ sơ nhập nhầm.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "reason": "Nhập trùng hồ sơ"
}
```

Rule:

- Ngựa không được có dòng nào (kể cả dòng đã đóng hoặc đã xóa) trong 13 bảng nghiệp vụ `HORSE_BUSINESS_TABLES`: medical, training, racing, ownership, stall, groom, feeding, checklist, incident, measurement, performance threshold. Vi phạm trả `409`; khi đó cần đổi lifecycle thay vì xóa.
- Ngựa không được đang là sire hoặc dam của ngựa khác (`409`).
- Lưu `deletedReason`, ghi audit `DELETE`.

Kết quả: `204`.

### `POST /horses/:horseId/activate`

Đưa ngựa tham chiếu vào câu lạc bộ.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "version": 1,
  "stallId": "00000000-0000-0000-0000-000000000004",
  "owners": [
    {
      "ownerId": "00000000-0000-0000-0000-000000000005",
      "percentage": 100,
      "isRepresentative": true
    }
  ]
}
```

Rule:

- Ngựa phải là ngựa tham chiếu; nếu không trả `409 Ngựa đã thuộc câu lạc bộ, không cần kích hoạt`.
- `version` phải khớp (`409`).
- `stallId` và `owners` tuân theo các rule như khi tạo.
- Chuyển `isReference = false`, `lifecycleStatus = ACTIVE`, `healthStatus = ELIGIBLE` và ghi audit.

Kết quả: `200` cùng hồ sơ.

### `GET /horses/:horseId/pedigree?depth=2`

Cây tổ tiên của ngựa.

Quyền: CM, HT, VET, OWNER (không có GROOM).

`depth` mặc định là `2`, phải là số nguyên từ 1 đến 4 (`400`). Mỗi node có `generation`, `parentRole` (`SIRE`/`DAM`) và `childId` để dựng cây. Tổ tiên đã xóa bị bỏ qua.

### `GET /horses/:horseId/permissions`

Trả các cờ cho UI:

- `canEdit`, `canEditRaceAptitude`, `canChangeLifecycle`, `canManageOwners`, `canChangeHealth`, `canActivateReference`.
- `recordableMeasurementTypes`: các loại chỉ số caller được ghi cho ngựa này.
- `canViewOwners`, `canViewMedicalRecords`, `canViewTrainingEvaluation`, `canViewPerformanceDetail`.

### `GET /horses/:horseId/eligibility`

Xem mục 5.

## 7. API trạng thái

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

- `400`: ngựa tham chiếu.
- `409`: cặp chuyển không hợp lệ, hoặc ngựa đang có buổi tập hay cuộc đua `IN_PROGRESS`.

### `PATCH /horses/:horseId/health-status`

Đổi tình trạng sức khỏe.

Quyền: `VETERINARIAN`.

Body:

```json
{
  "healthStatus": "UNDER_OBSERVATION"
}
```

Lỗi đáng chú ý:

- `400`: ngựa tham chiếu.
- `409`: ngựa `TRANSFERRED`, hoặc đặt `ELIGIBLE` khi còn training lock.

## 8. API chủ sở hữu

Rule chung cho danh sách chủ (dùng ở `POST /horses`, activate và `PUT /owners`), vi phạm trả `400`:

- Từ 1 đến 20 chủ, không trùng `ownerId`.
- `percentage` từ `0.01` đến `100`, tối đa 2 chữ số thập phân. Tổng phải đúng `100`.
- Tối đa một chủ có `isRepresentative = true`. Unique index `horse_ownerships_active_rep_uq` cũng bảo vệ rule này ở database.
- Mỗi chủ phải là user role `HORSE_OWNER` đang `ACTIVE`.

### `GET /horses/:horseId/owners`

Lịch sử chủ sở hữu, dòng đang mở lên trước rồi đến `startAt` giảm dần.

Quyền: `CLUB_MANAGER`, `HORSE_OWNER`.

- CM thấy mọi dòng với đủ field, kể cả email.
- OWNER phải đang sở hữu ngựa. OWNER thấy đủ các dòng của chính mình, kể cả dòng đã đóng. Với đồng sở hữu hiện tại, OWNER chỉ thấy `ownerName`, `percentage`, `isRepresentative`. Chủ cũ của người khác bị ẩn.

### `PUT /horses/:horseId/owners`

Thay toàn bộ danh sách chủ hiện tại.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "owners": [
    {
      "ownerId": "00000000-0000-0000-0000-000000000005",
      "percentage": 50,
      "isRepresentative": true
    },
    {
      "ownerId": "00000000-0000-0000-0000-000000000007",
      "percentage": 50
    }
  ],
  "transferredAt": "2026-09-20T09:00:00+07:00"
}
```

Rule:

- Ngựa tham chiếu trả `400`, ngựa `TRANSFERRED` trả `409`.
- `transferredAt` mặc định là thời điểm hiện tại, không được ở tương lai (`400`), và phải sau `startAt` của lần gán chủ gần nhất (`409`).
- Chạy trong transaction, khóa row ngựa và các dòng sở hữu đang mở.
- Dòng mở có cùng chủ, cùng tỷ lệ và cùng cờ đại diện được giữ nguyên. Các dòng mở khác được đóng với `endAt = transferredAt`. Phần mới hoặc đã đổi được thêm với `startAt = transferredAt`. Không có gì khác thì không ghi.

Kết quả: `200` cùng toàn bộ lịch sử sau thay đổi.

### `GET /owners/me/horses`

Danh sách ngựa caller đang sở hữu, sắp theo tên.

Quyền: `HORSE_OWNER`.

## 9. API chỉ số đo

Các loại chỉ số:

| Type             | Đơn vị    | Khoảng hợp lệ | Khoảng bình thường |
| ---------------- | --------- | ------------- | ------------------ |
| `WEIGHT`         | `kg`      | 30–1500       | 400–600            |
| `HEIGHT`         | `cm`      | 50–250        | 150–175            |
| `BODY_CONDITION` | `score`   | 1–9           | 4–6                |
| `TEMPERATURE`    | `celsius` | 30–45         | 37.2–38.3          |

Giá trị ngoài khoảng hợp lệ bị từ chối. Giá trị ngoài khoảng bình thường vẫn được lưu và được đánh dấu `isAbnormal = true`.

### `GET /horses/:horseId/measurements?type=WEIGHT`

Liệt kê chỉ số, `measuredAt` mới nhất trước, tối đa 200 dòng, không phân trang. `type` không bắt buộc.

Quyền: mọi role, theo phạm vi ở mục 2.

### `POST /horses/:horseId/measurements`

Ghi một lần đo.

Quyền: `HEAD_TRAINER`, `VETERINARIAN`, `GROOM`, theo loại ở bảng mục 2. User có nhiều role được hợp các loại lại.

Body:

```json
{
  "type": "TEMPERATURE",
  "value": 38.9,
  "measuredAt": "2026-09-20T06:30:00+07:00"
}
```

Rule:

- Ngựa tham chiếu trả `400`, ngựa `TRANSFERRED` trả `409`.
- Caller không được ghi loại này cho ngựa này: `403`.
- `value` có tối đa 2 chữ số thập phân và nằm trong khoảng hợp lệ (`400`).
- `measuredAt` mặc định là hiện tại, không được sau hiện tại quá 60 giây và không được lùi quá 7 ngày (`400`).

Cảnh báo (mỗi lần ghi có tối đa một cảnh báo):

| Alert         | Severity  | Điều kiện                                                                         |
| ------------- | --------- | --------------------------------------------------------------------------------- |
| `FEVER`       | `URGENT`  | `TEMPERATURE` > 38.6                                                              |
| `WEIGHT_DROP` | `WARNING` | `WEIGHT` thấp hơn quá 5% so với mức cân cao nhất trong 14 ngày trước `measuredAt` |

`WEIGHT_DROP` kèm `baselineValue` và `dropPercent`. Response `201` gồm bản ghi và `alerts[]`. Với mỗi cảnh báo, sau khi lưu hệ thống phát event `horse.measurement.alert`.

### `DELETE /horses/:horseId/measurements/:measurementId`

Soft delete một lần đo nhập sai. Chỉ số không có API sửa; muốn sửa thì xóa rồi ghi lại.

Quyền: `HEAD_TRAINER`, `VETERINARIAN`, `GROOM`.

Rule:

- Khóa row bản ghi đo trong transaction. Bản ghi không tồn tại hoặc thuộc ngựa khác trả `404`.
- Chỉ người đã ghi được xóa, và người đó vẫn phải còn quyền ghi loại này (`403`).
- Ghi audit `DELETE` với entity `HORSE_MEASUREMENT`.

Kết quả: `204`.

## 10. API ô chuồng và xếp chuồng

### `GET /stalls`

Danh sách ô chuồng, sắp theo `code`. Query có thể lọc `barnId`, `status`, `type`.

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
  "status": "AVAILABLE",
  "description": "Gần cửa phía đông",
  "hasCamera": true
}
```

`type` mặc định `STANDARD` (khác: `ISOLATION`, `RECOVERY`, `FOALING`). `status` mặc định `AVAILABLE`. `hasCamera` mặc định `false`.

Rule:

- Barn phải tồn tại (`404`) và đang `ACTIVE` (`400`).
- Nếu barn có `capacity`, số ô chưa xóa phải còn chỗ (`409`).
- `code` (đã trim) không được trùng với ô chưa xóa (`409`).

Kết quả: `201`.

### `GET /stalls/:id`

Chi tiết ô chuồng.

### `PATCH /stalls/:id`

Sửa một phần các field của endpoint tạo.

Quyền: `CLUB_MANAGER`.

Khi đổi `barnId`, barn mới phải tồn tại, `ACTIVE` và còn chỗ. `status` được đặt tự do, không có bảng chuyển.

### `DELETE /stalls/:id`

Soft delete ô chuồng.

Quyền: `CLUB_MANAGER`.

Ô đang có ngựa (assignment chưa kết thúc) trả `409`. Kết quả: `204`.

### `GET /stalls/:id/assignments`

Lịch sử xếp chuồng của ô, kèm `horse { id, name }`, sắp theo `startAt` giảm dần.

### `POST /stalls/:id/assignments`

Xếp ngựa vào ô.

Quyền: `CLUB_MANAGER`.

Body:

```json
{
  "horseId": "00000000-0000-0000-0000-000000000001",
  "startAt": "2026-09-20T08:00:00+07:00"
}
```

Rule:

- Ô tồn tại (`404`), đang `AVAILABLE` (`400`), barn đang `ACTIVE` (`400`), và chưa có ngựa (`409`).
- Ngựa tồn tại (`404`), không phải ngựa tham chiếu (`400`), và chưa ở ô khác (`409`).
- Trong cùng transaction: tạo assignment và chuyển ô sang `OCCUPIED`.

Kết quả: `201`.

### `POST /stall-assignments/:id/end`

Kết thúc xếp chuồng.

Quyền: `CLUB_MANAGER`, `HEAD_TRAINER`.

Assignment đã kết thúc trả `400`. Trong transaction: ghi `endAt` theo giờ server; nếu ô đang `OCCUPIED` thì trả về `AVAILABLE`.

## 11. API Groom phụ trách

Mỗi ngựa có tối đa một Groom phụ trách tại một thời điểm. Unique index `groom_assignments_active_horse_uq` bảo vệ rule này. Giao Groom không phụ thuộc việc ngựa có chuồng hay không.

### `GET /horses/:id/grooms`

Lịch sử Groom của ngựa, kèm `groom { id, fullName, email }`, sắp theo `startAt` giảm dần.

Quyền: CM, HT, VET, GROOM.

### `PUT /horses/:id/groom`

Giao hoặc đổi Groom.

Quyền: `CLUB_MANAGER`; `HEAD_TRAINER` với ngựa trong barn mình.

Body:

```json
{
  "groomId": "00000000-0000-0000-0000-000000000020"
}
```

Rule:

- Ngựa tham chiếu trả `400`, ngựa `TRANSFERRED` trả `409`. Ngựa `RETIRED` vẫn được giao.
- `groomId` phải là user role `GROOM` đang `ACTIVE` (`400`).
- Nếu trùng Groom hiện tại thì trả dòng đang có, không ghi (idempotent).
- Nếu khác: đóng dòng hiện tại và mở dòng mới, cả hai dùng giờ server. Client không truyền `startAt`.
- Hai request đồng thời vi phạm unique index thì request sau nhận `409 Ngựa vừa được giao groom khác, vui lòng tải lại`.

Kết quả: `200`.

### `DELETE /horses/:id/groom`

Gỡ Groom hiện tại.

Quyền: `CLUB_MANAGER`; `HEAD_TRAINER` với ngựa trong barn mình.

Ngựa chưa có Groom trả `404 Ngựa chưa có groom phụ trách`. Kết quả: `204`.

## 12. Mã lỗi chung

| HTTP  | Ý nghĩa                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `400` | Body, UUID hoặc ngày tháng không hợp lệ; ngựa tham chiếu dùng thao tác vận hành; tỷ lệ sở hữu sai; chỉ số ngoài khoảng           |
| `401` | Thiếu hoặc access token không hợp lệ                                                                                             |
| `403` | Role không đủ quyền, HT ngoài barn, Groom không được giao ngựa, không phải người ghi chỉ số                                      |
| `404` | Không tìm thấy tài nguyên, hoặc OWNER xem ngựa không sở hữu, hoặc role khác CM xem ngựa tham chiếu                               |
| `409` | State transition không hợp lệ, ngựa `TRANSFERRED`, `version` lệch, trùng microchip hoặc mã ô, ô đang có ngựa, xung đột đồng thời |

## 13. Transaction, lock, audit và event

Lock:

- Advisory lock `pg_advisory_xact_lock(hashtext('horses.pedigree'))`: lấy khi tạo ngựa có cha mẹ, khi sửa field phả hệ, và luôn lấy khi xóa. Mục đích là để hai thao tác đổi phả hệ đồng thời không cùng tạo ra vòng lặp.
- Row lock `pessimistic_write`:
  - Row ngựa: xóa, đổi lifecycle, thay chủ.
  - Row ô chuồng: khi tạo hoặc activate ngựa kèm `stallId`.
  - Các dòng sở hữu đang mở: thay chủ.
  - Bản ghi đo: xóa chỉ số.
- Optimistic lock bằng `version`: `PATCH /horses/:id` và activate.

Audit (ghi `audit_logs` trong cùng transaction):

| Thao tác      | Entity              | Action   |
| ------------- | ------------------- | -------- |
| Sửa hồ sơ     | `HORSE`             | `UPDATE` |
| Xóa ngựa      | `HORSE`             | `DELETE` |
| Activate      | `HORSE`             | `UPDATE` |
| Đổi lifecycle | `HORSE`             | `UPDATE` |
| Xóa chỉ số đo | `HORSE_MEASUREMENT` | `DELETE` |

Event:

- `horse.measurement.alert`: phát sau khi lưu chỉ số, mỗi cảnh báo một event. Payload gồm alert, severity, baseline, measurementId, horseId, measuredBy, type, value, unit, measuredAt.

Soft delete:

- `horses`: có `deleted_at` và `deleted_reason`.
- `horse_measurements`: có `deleted_at`. Bản ghi đã xóa không xuất hiện trong danh sách, chỉ số mới nhất và mốc cân nặng 14 ngày.
- `stalls`: có `deleted_at`.
- `horse_ownerships`, `stall_assignments`, `groom_assignments`: không xóa, chỉ đóng bằng `end_at`.

## 14. Index và constraint

Các unique index bảo vệ rule nghiệp vụ:

- `horses_microchip_uq (microchip_id) WHERE microchip_id IS NOT NULL AND deleted_at IS NULL`.
- `horse_ownerships_active_rep_uq (horse_id) WHERE is_representative AND end_at IS NULL`: một chủ đại diện.
- `stall_assignments_active_stall_uq (stall_id) WHERE end_at IS NULL`: một ô một ngựa.
- `stall_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`: một ngựa một ô.
- `groom_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`: một ngựa một Groom.
- `stalls_code_uq (code) WHERE deleted_at IS NULL`.

Index phục vụ query:

- `horse_ownerships (horse_id, end_at)`, `horse_ownerships (owner_id, end_at)`.
- `horse_measurements (horse_id, type, measured_at)`.
- `groom_assignments (groom_id, end_at)`.

Migration của flow:

| Migration                    | Nội dung                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `UnaccentExtension`          | Bật extension `unaccent` cho tìm kiếm tên                                                          |
| `SplitGroomAssignments`      | Tạo `groom_assignments`, chép dữ liệu Groom từ `stall_assignments`                                 |
| `DropStallAssignmentGroom`   | Bỏ cột `stall_assignments.groom_id`                                                                |
| `AddOwnershipRepresentative` | Thêm `is_representative` và unique index chủ đại diện                                              |
| `OwnershipTimestamps`        | Đổi `start_date`/`end_date` (date) thành `start_at`/`end_at` (timestamptz, giờ `Asia/Ho_Chi_Minh`) |
| `HorseMeasurementSoftDelete` | Thêm `horse_measurements.deleted_at`                                                               |
| `HorseLifecycleReason`       | Thêm `lifecycle_reason`, `lifecycle_changed_at`, `deleted_reason` cho `horses`                     |

## 15. Điểm còn mở

Các điểm dưới đây mô tả đúng code hiện tại nhưng chưa nhất quán hoặc chưa hoàn thiện, cần quyết định trước khi sửa:

1. **Mã lỗi khi ô không trống bị lệch.** `POST /stalls/:id/assignments` trả `400` khi ô không `AVAILABLE` hoặc barn không `ACTIVE`, còn `POST /horses` và activate kèm `stallId` trả `409` cho cùng điều kiện.
2. **`POST /stalls/:id/assignments` thiếu bảo vệ.** Không khóa row ô chuồng và không bắt lỗi unique `23505`, nên hai request đồng thời có thể làm request sau nhận `500`. Endpoint cũng không chặn ngựa `RETIRED` hoặc `TRANSFERRED`.
3. **`PATCH /health-status`** không chạy trong transaction, không kiểm tra `version` và không ghi audit.
4. **`PUT /owners`** không ghi audit, dù enum `AuditEntityType.HORSE_OWNERSHIP` đã có sẵn.
5. **Event `horse.measurement.alert` chưa có listener.** Comment trong code nói module Notifications sẽ nghe, nhưng hiện chưa có `@OnEvent` nào.
6. **`POST /stall-assignments/:id/end` trả `201`** (mặc định của POST), trong khi Swagger khai báo `ApiOkResponse` (`200`).
7. **`assertGroomAssigned`** trong `horse-profiles.service.ts` là private method không được gọi ở đâu.
8. **Microchip:** ứng dụng chặn trùng cả với ngựa đã xóa, còn unique index ở database chỉ áp dụng cho ngựa chưa xóa. Hai tầng đang dùng hai rule khác nhau.
