# Current Entity Model

Tài liệu này mô tả schema hiện trạng của backend `horse-racing-ne`. PostgreSQL là database chính, TypeORM quản lý entity và migration; `synchronize` đang tắt.

## Modeling Rules

- Các bảng nghiệp vụ dùng UUID primary key do PostgreSQL sinh bằng `uuid_generate_v4()`.
- Tên property dùng camelCase trong TypeScript; tên cột dùng snake_case trong PostgreSQL.
- Các giá trị `numeric` được biểu diễn bằng `string` trong entity khi cần giữ độ chính xác.
- Entity có `updated_at` và `version` khi thuộc nhóm mutable; entity cần soft delete kế thừa `deleted_at`.
- Hệ thống phục vụ đúng một câu lạc bộ: không có bảng `clubs` và không có cột `club_id`; dữ liệu dùng chung toàn hệ thống, phân quyền theo role, phân công và khu chuồng.
- Ownership, measurements, medical records, training locks và audit logs là dữ liệu lịch sử, không ghi đè thành một snapshot duy nhất.
- Mọi thay đổi schema phải đi qua migration. Không dùng `synchronize` trong môi trường chạy thật.

## Current Tables

| Module        | Tables                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Users         | `users`                                                                                  |
| Horses        | `horses`, `horse_ownerships`, `horse_measurements`                                       |
| Training      | `training_plans`, `training_sessions`, `time_trials`                                     |
| Performance   | `performance_metrics`, `performance_thresholds`, `performance_evaluations`               |
| Medical       | `medical_records`, `prescriptions`, `injury_markers`, `training_locks`, `care_schedules` |
| Stable        | `barns`, `stalls`, `stall_assignments`, `groom_assignments`, `feeding_plans`, `daily_checklists`, `incidents` |
| Racing        | `races`, `race_registrations`                                                            |
| Supplies      | `supply_items`, `supply_requests`                                                        |
| Notifications | `notifications`                                                                          |
| Audit         | `audit_logs`                                                                             |
| Media         | `media_assets`                                                                           |

`Reports`, `Realtime` và `Health` chưa có bảng persistence riêng.

## Horse Schema

API, quyền và state machine của nhóm bảng này mô tả chi tiết trong [Flow 1](flow1-horses.md).

### `horses`

- Primary key: `id`. Soft delete bằng `deleted_at`.
- Foreign keys: `photo_asset_id -> media_assets.id`.
- Self-references: `sire_id -> horses.id`, `dam_id -> horses.id` (`ON DELETE SET NULL`).
- Profile fields: `name`, `gender`, `breed`, `color`, `race_aptitude`, `date_of_birth`, `microchip_id`.
- `is_reference`: `true` cho ngựa giống bên ngoài club, chỉ dùng làm tổ tiên trong pedigree; không có owner, cân nặng, trạng thái vận hành và bị ẩn khỏi danh sách mặc định.
- Current state: `health_status` (`ELIGIBLE`, `UNDER_OBSERVATION`, `INJURED`, `QUARANTINED`), `lifecycle_status` (`ACTIVE`, `RETIRED`, `TRANSFERRED`).
- `lifecycle_reason`, `lifecycle_changed_at`: lý do và thời điểm của lần đổi vòng đời gần nhất (lịch sử đầy đủ ở `audit_logs`). `deleted_reason`: lý do xóa mềm hồ sơ tạo nhầm.
- Index: `horses_microchip_uq` (microchip unique với bản ghi chưa xóa).
- Đổi vòng đời (`PATCH /horses/:horseId/lifecycle-status`, Club Manager, bắt buộc `reason`): ACTIVE → RETIRED/TRANSFERRED, RETIRED → ACTIVE/TRANSFERRED, TRANSFERRED → ACTIVE (CLB mua lại). Chạy trong 1 transaction có khóa dòng `horses`:
  - RETIRED: hủy giáo án SCHEDULED/ACTIVE cùng buổi tập SCHEDULED, rút đăng ký thi đấu còn mở ở race PLANNED/OPEN (`WITHDRAWN`); giữ ô chuồng, lịch chăm sóc, khóa huấn luyện.
  - TRANSFERRED: như RETIRED, thêm đóng sở hữu, groom, xếp chuồng (ô về AVAILABLE) và tự gỡ khóa huấn luyện (`released_by = null`).
  - Ngựa đang có buổi tập IN_PROGRESS hoặc race IN_PROGRESS thì trả 409.
- Xóa (`DELETE /horses/:id`, Club Manager, body `{ reason }`): xóa mềm, chỉ khi ngựa không là cha/mẹ của ngựa khác và chưa có dòng nào ở `medical_records`, `care_schedules`, `training_locks`, `training_plans`, `race_registrations`, `horse_ownerships`, `stall_assignments`, `groom_assignments`, `feeding_plans`, `daily_checklists`, `incidents`, `horse_measurements`, `performance_thresholds`.

Pedigree dùng direct parent columns. Service chạy recursive CTE trên `sire_id`/`dam_id`, giới hạn `depth` 1–4 (mặc định 2).

### `horse_ownerships`

- Foreign keys: `horse_id -> horses.id`, `owner_id -> users.id`.
- Lưu `percentage`, `start_at`, `end_at` (`timestamptz`), khoảng nửa mở `[start_at, end_at)`. Bản ghi `end_at IS NULL` là sở hữu hiện tại.
- `is_representative`: chủ đại diện, không bắt buộc, mỗi ngựa tối đa một đại diện đang active (`horse_ownerships_active_rep_uq (horse_id) WHERE is_representative AND end_at IS NULL`). Bắt buộc có đại diện khi đăng ký thi đấu thuộc module racing.
- Đổi chủ/chuyển nhượng (`PUT /horses/:id/owners`, `transferredAt` tùy chọn, mặc định hiện tại): không sửa bản ghi cũ. Chủ giữ nguyên tỉ lệ và cờ đại diện thì giữ bản ghi; bản ghi thay đổi hoặc bị bỏ đóng với `end_at = transferredAt`, phần mới tạo bản ghi `start_at = transferredAt`. Một khoản phát sinh lúc t thuộc bản ghi có `start_at <= t < end_at`, nên không tính trùng cho hai chủ. `transferredAt` không ở tương lai và phải sau `start_at` mới nhất của các bản ghi đang mở. Chạy trong một transaction có khóa dòng `horses` và các bản ghi đang mở.
- Xem (`GET /horses/:id/owners`): Club Manager thấy toàn bộ lịch sử; Horse Owner thấy đầy đủ các bản ghi của mình, đồng chủ đang sở hữu chỉ có tên, tỉ lệ, cờ đại diện, không thấy chủ cũ.

### `horse_measurements`

- Foreign keys: `horse_id -> horses.id`, `measured_by -> users.id`.
- Lưu `type`, `value numeric(7,2)`, `measured_at`, `deleted_at`. Bản ghi không sửa được; nhập sai thì người đã ghi xóa mềm (`deleted_at`, ghi `audit_logs` DELETE kèm giá trị cũ) rồi đo lại. Bản đã xóa bị ẩn khỏi lịch sử, chỉ số mới nhất và mốc cảnh báo. Giá trị hiện tại của mỗi loại là bản ghi mới nhất (chưa xóa) của loại đó.
- `type`, đơn vị và các khoảng cố định trong code (`HORSE_MEASUREMENT_SPECS`), không lưu cột unit. Ngoài khoảng hợp lệ thì API từ chối; ngoài khoảng bình thường vẫn ghi được nhưng response có `isAbnormal = true`:

| type             | Đơn vị  | Khoảng hợp lệ | Khoảng bình thường |
| ---------------- | ------- | ------------- | ------------------ |
| `WEIGHT`         | kg      | 30–1500       | 400–600            |
| `HEIGHT`         | cm      | 50–250        | 150–175            |
| `BODY_CONDITION` | score   | 1–9           | 4–6                |
| `TEMPERATURE`    | celsius | 30–45         | 37.2–38.3          |

- Quyền ghi theo loại (`MEASUREMENT_TYPES_BY_ROLE`): Head Trainer (ngựa trong khu mình) `WEIGHT`, `BODY_CONDITION`; Groom (ngựa được giao) `WEIGHT`, `TEMPERATURE`; Veterinarian cả bốn. Người nhiều role được hợp các loại. Xem: mọi role trong CLB, Horse Owner chỉ ngựa sở hữu.
- `measured_at` không ở tương lai, lùi tối đa 7 ngày.
- Cảnh báo tự động khi ghi, trả trong `alerts[]` và phát domain event `horse.measurement.alert` sau khi lưu (payload `HorseMeasurementAlertEvent`):
  - `FEVER` (URGENT): thân nhiệt > 38.6 °C.
  - `WEIGHT_DROP` (WARNING): cân nặng giảm > 5% so với cân nặng cao nhất trong 14 ngày trước `measured_at`.
  - Người nhận (cho listener của module notifications): mọi Veterinarian đang ACTIVE và Head Trainer của khu đang chứa ngựa. Hiện chưa có listener nào đăng ký event này.
- Thêm loại mới chỉ cần bổ sung enum và spec, không cần migration.
- Index: `horse_measurements_horse_type_measured_idx (horse_id, type, measured_at)`.

### Groom phụ trách

Bảng `groom_assignments` (`horse_id`, `groom_id`, `start_at`, `end_at`), tách khỏi `stall_assignments` (chỉ còn ghi ngựa ở ô nào).

- Mỗi ngựa tối đa 1 groom đang phụ trách: `groom_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`.
- Giao/đổi groom: `PUT /horses/:id/groom` đóng dòng đang mở rồi mở dòng mới trong 1 transaction; giao lại đúng groom hiện tại thì không đổi gì. Thôi giao: `DELETE /horses/:id/groom`. Lịch sử: `GET /horses/:id/grooms`.
- Quyền: Club Manager mọi ngựa; Head Trainer chỉ ngựa đang ở khu mình. Không giao cho ngựa tham chiếu hoặc đã chuyển nhượng.
- Ngựa chuyển sang `TRANSFERRED` thì dòng groom đang mở tự đóng (cùng lúc đóng ownership và phân công chuồng).
- Groom có thể được giao cho ngựa chưa xếp chuồng; xếp chuồng không cần groom.

## Medical & Supplies

- `injury_markers.position` (`jsonb`, nullable): tọa độ `{ x, y, z }` trên mô hình 3D của ngựa; `body_region` vẫn bắt buộc để lọc/tô theo vùng.
- `supply_items.category`: `FEED` (thức ăn), `MEDICINE` (thuốc), `EQUIPMENT` (dụng cụ); bắt buộc.

## Khu chuồng

### `barns`

- Primary key: `id`. Soft delete bằng `deleted_at`.
- Foreign keys: `head_trainer_id -> users.id` (`ON DELETE SET NULL`).
- `name` unique (`barns_name_uq`, bản ghi chưa xóa). Mỗi khu có tối đa 1 Head Trainer; một Head Trainer có thể phụ trách nhiều khu.
- `description` (`text`, nullable): Mô tả khu chuồng, ghi chú cơ sở vật chất.
- `capacity` (`int`, nullable): Sức chứa tối đa (số lượng ô chuồng).
- `status` (`BarnStatus`, default `ACTIVE`): `ACTIVE`, `MAINTENANCE`, `CLOSED`.
- `stalls.barn_id -> barns.id` (NOT NULL). Migration backfill một khu `Main` nếu đã có stall.
- `head_trainer_id` phải là user `HEAD_TRAINER` `ACTIVE` (kiểm tra ở service). Không đổi role của Head Trainer còn phụ trách khu.

### `stalls`

- Primary key: `id`. Soft delete bằng `deleted_at`.
- Foreign keys: `barn_id -> barns.id` (`ON DELETE RESTRICT`).
- `code` unique (`stalls_code_uq`, bản ghi chưa xóa). Mã ô chuồng duy nhất trong toàn hệ thống.
- `type` (`StallType`, default `STANDARD`):
  - `STANDARD`: Ô chuồng tiêu chuẩn phục vụ lưu trú thường nhật.
  - `ISOLATION`: Ô chuồng cách ly y tế, kiểm dịch bệnh dịch lây nhiễm.
  - `RECOVERY`: Ô chuồng tịnh dưỡng chuyên biệt sau phẫu thuật / chấn thương.
  - `FOALING`: Ô chuồng đẻ rộng rãi, an toàn cho ngựa mang thai / ngựa con sơ sinh.
- `status` (`StallStatus`, default `AVAILABLE`): `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`, `RESERVED`.
- `description` (`text`, nullable): Mô tả đặc thù ô chuồng, tiện ích hoặc ghi chú cơ sở vật chất.
- `has_camera` (`boolean`, default `false`): Ô chuồng có trang bị hệ thống camera giám sát 24/7.
- Không được xóa ô đang có ngựa (`stall_assignments` mở).

### `stall_assignments`

- Foreign keys: `horse_id -> horses.id`, `stall_id -> stalls.id` (`ON DELETE RESTRICT`).
- Lưu `start_at`, `end_at` (`timestamptz`). Bản ghi `end_at IS NULL` là ô ngựa đang ở. Không xóa, chỉ đóng bằng `end_at`.
- Mỗi ô tối đa 1 ngựa và mỗi ngựa tối đa 1 ô tại một thời điểm: `stall_assignments_active_stall_uq (stall_id) WHERE end_at IS NULL`, `stall_assignments_active_horse_uq (horse_id) WHERE end_at IS NULL`.
- Không còn cột `groom_id`; groom phụ trách nằm ở `groom_assignments`.
- Mở bản ghi thì ô chuyển `AVAILABLE → OCCUPIED`; đóng bản ghi (`POST /stall-assignments/:id/end` hoặc ngựa sang `TRANSFERRED`) thì ô `OCCUPIED` về `AVAILABLE`.

### Ngựa thuộc khu

Ngựa thuộc khu của Head Trainer khi có `stall_assignments` active (`end_at IS NULL`) vào stall có `barn_id` trỏ tới khu có `head_trainer_id` là Head Trainer đó (`src/modules/stable/utils/trainer-barn.ts`). Ngựa chưa xếp chuồng không thuộc khu nào: Head Trainer chỉ xem thông tin công khai, Club Manager xếp chuồng trước khi Head Trainer thao tác.

### Phân quyền Head Trainer theo khu

| Nhóm                | Phạm vi                     | Nội dung                                                                                                                                                                                                           |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Công khai        | Mọi Head Trainer trong club | Hồ sơ ngựa, pedigree, nhãn sức khỏe, lifecycle, measurements, eligibility; tiến độ giáo án và lịch buổi tập; metrics, performance, workload, time trial; thành tích và lịch giải; sơ đồ khu/stall; báo cáo tiến độ |
| B. Nhạy cảm         | Head Trainer của khu        | Đánh giá chuyên môn buổi tập; ngưỡng và cảnh báo thể lực; hồ sơ y tế, đơn thuốc, chấn thương, khóa huấn luyện; feeding plan, checklist, sự cố; đăng ký thi đấu; báo cáo sức khỏe ngựa                              |
| C. Ghi / quyết định | Head Trainer của khu        | Tạo/sửa/kích hoạt/hoàn thành/hủy giáo án; tạo/sửa/start/complete/cancel buổi tập; time trial, metrics, đánh giá; measurement; ngưỡng; duyệt feeding plan; đăng ký giải; xử lý sự cố                                |
| D. Không xem        | —                           | Chủ sở hữu và tỷ lệ sở hữu; tài chính, chi phí, doanh thu                                                                                                                                                          |

Club Manager không bị giới hạn theo khu. Veterinarian toàn club. Vi phạm nhóm B/C trả `403`. Các module còn stub (Performance, Realtime, Racing, Stable, Reports) áp dụng bảng này khi implement.

## Domain Constraints

- Parent phải tồn tại; sire không phải `FEMALE`, dam phải là `FEMALE`; cha/mẹ sinh trước con khi có ngày sinh.
- Sire và dam không trùng nhau; horse không làm parent của chính nó; cycle được kiểm tra bằng CTE trước khi update.
- Không đổi giới tính của ngựa đang là sire/dam trái với vai trò đó.
- Owner phải là user `HORSE_OWNER` đang `ACTIVE`; tỷ lệ > 0, không trùng, tổng đúng 100.
- Microchip không trùng với bất kỳ ngựa nào, kể cả hồ sơ đã xóa mềm (kiểm ở service, index DB chỉ chặn hồ sơ chưa xóa). Xóa hồ sơ tạo nhầm thì xóa chip trước.
- Ngày sinh không ở tương lai (tạo và sửa).
- Tạo ngựa có thể kèm `stallId` và `owners`, chạy trong 1 transaction. Ô phải còn (chưa xóa), `AVAILABLE`, thuộc khu `ACTIVE` và chưa có ngựa. Ngựa tham chiếu không được kèm ô/chủ. Luật ô trống này cũng áp cho `POST /stalls/:id/assignments`, nhưng mã lỗi đang lệch: tạo/activate ngựa trả `409`, còn `POST /stalls/:id/assignments` trả `400` khi ô không `AVAILABLE` hoặc khu không `ACTIVE`.
- Lifecycle: `ACTIVE ↔ RETIRED`, `ACTIVE ↔ TRANSFERRED`, `RETIRED → TRANSFERRED`. Sang `TRANSFERRED`: đóng ownership, groom, phân công chuồng (ô `OCCUPIED` về `AVAILABLE`), hồ sơ chỉ đọc. Ngựa quay lại club: mở lại hồ sơ cũ bằng `TRANSFERRED → ACTIVE` (1 microchip = 1 hồ sơ), rồi gán chủ và xếp chuồng lại.
- Không set `health_status = ELIGIBLE` khi có `training_locks` `ACTIVE`.
- Chỉ xóa mềm ngựa chưa có dòng nào trong các bảng nghiệp vụ (`HORSE_BUSINESS_TABLES`, danh sách ở mục `horses`) và không là parent của ngựa khác.
- Eligibility: tập khi `ACTIVE`, health `ELIGIBLE`/`UNDER_OBSERVATION`, không lock; đua khi `ACTIVE`, health `ELIGIBLE`, không lock.
- Phạm vi xem: danh sách ngựa (`GET /horses`) Club Manager, Head Trainer, Veterinarian, Groom toàn club; Horse Owner theo `horse_ownerships` active. Chi tiết ngựa và API con: Groom theo `groom_assignments` active. Head Trainer bị giới hạn thêm theo khu chuồng (xem mục Khu chuồng).

## Users

- Email unique toàn hệ thống (`users_email_uq`). Ràng buộc "còn ít nhất một Club Manager ACTIVE" khóa các dòng Club Manager đang ACTIVE (`SELECT ... FOR UPDATE`) thay cho khóa dòng `clubs`.
- `users.status` mặc định `INACTIVE` (fail-closed); tài khoản do Club Manager tạo được set `ACTIVE` tường minh.
- `KeycloakGuard` chỉ verify chữ ký JWT (JWKS, không introspect) và kiểm tra `@Access` dựa trên realm role trong token; guard không đọc bảng `users`.
- `status` và `role` được chặn ở service qua `currentUserForActor` (đọc `users` theo `keycloak_id`, cache theo từng request): user không tồn tại, không `ACTIVE`, hoặc chưa có role bị trả `403`. Service nào dùng helper này thì khóa tài khoản có hiệu lực ngay.
- Vì role trong guard lấy từ JWT, sau khi đổi role (`PATCH /users/:id`) hoặc chuyển status khác `ACTIVE`, `UsersService` gọi Keycloak logout để thu hồi mọi session/refresh token của user. Access token đã cấp vẫn hợp lệ với guard đến khi hết hạn, nên TTL access token cần ngắn. Logout là best-effort: nếu Keycloak lỗi, service chỉ ghi warning và không rollback thay đổi.

## Schema Delivery

Schema hiện tại dùng `horses.sire_id` và `horses.dam_id` cho pedigree. Các thay đổi schema được quản lý bằng migration và không dùng `synchronize`.

## Operational Notes

- `pnpm db:migrate` áp dụng migration chưa chạy.
- API docs được regenerate bằng `pnpm docs:api`.
- Các migration lịch sử không nên sửa sau khi đã chạy; schema mới phải dùng migration mới.
