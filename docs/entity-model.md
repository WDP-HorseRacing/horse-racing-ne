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
| Stable        | `barns`, `stalls`, `stall_assignments`, `feeding_plans`, `daily_checklists`, `incidents` |
| Racing        | `races`, `race_registrations`                                                            |
| Supplies      | `supply_items`, `supply_requests`                                                        |
| Notifications | `notifications`                                                                          |
| Audit         | `audit_logs`                                                                             |
| Media         | `media_assets`                                                                           |

`Reports`, `Realtime` và `Health` chưa có bảng persistence riêng.

## Horse Schema

### `horses`

- Primary key: `id`. Soft delete bằng `deleted_at`.
- Foreign keys: `photo_asset_id -> media_assets.id`.
- Self-references: `sire_id -> horses.id`, `dam_id -> horses.id` (`ON DELETE SET NULL`).
- Profile fields: `name`, `gender`, `breed`, `color`, `race_aptitude`, `date_of_birth`, `microchip_id`.
- `is_reference`: `true` cho ngựa giống bên ngoài club, chỉ dùng làm tổ tiên trong pedigree; không có owner, cân nặng, trạng thái vận hành và bị ẩn khỏi danh sách mặc định.
- Current state: `health_status` (`ELIGIBLE`, `UNDER_OBSERVATION`, `INJURED`, `QUARANTINED`), `lifecycle_status` (`ACTIVE`, `RETIRED`, `TRANSFERRED`).
- Index: `horses_microchip_uq` (microchip unique với bản ghi chưa xóa).

Pedigree dùng direct parent columns. Service chạy recursive CTE trên `sire_id`/`dam_id`, giới hạn `depth` 1–4 (mặc định 2).

### `horse_ownerships`

- Foreign keys: `horse_id -> horses.id`, `owner_id -> users.id`.
- Lưu `percentage`, `start_date`, `end_date`. Bản ghi `end_date IS NULL` là sở hữu hiện tại.
- Đổi chủ: đóng các bản ghi active (`end_date = hôm nay`) và tạo bản ghi mới trong một transaction có khóa dòng `horses`.

### `horse_measurements`

- Foreign keys: `horse_id -> horses.id`, `measured_by -> users.id`.
- Lưu `type`, `value numeric(7,2)`, `measured_at`. Bản ghi bất biến; giá trị hiện tại của mỗi loại là bản ghi mới nhất của loại đó.
- `type` và đơn vị cố định trong code (`HORSE_MEASUREMENT_SPECS`), không lưu cột unit:

| type             | Đơn vị  | Khoảng hợp lệ |
| ---------------- | ------- | ------------- |
| `WEIGHT`         | kg      | 30–1500       |
| `HEIGHT`         | cm      | 50–250        |
| `BODY_CONDITION` | score   | 1–9           |
| `TEMPERATURE`    | celsius | 30–45         |

- Thêm loại mới chỉ cần bổ sung enum và spec, không cần migration.
- Index: `horse_measurements_horse_type_measured_idx (horse_id, type, measured_at)`.

### Groom phụ trách

Không có bảng riêng. Groom phụ trách ngựa được xác định bởi `stall_assignments` active (`end_at IS NULL`, `groom_id = user`).

## Medical & Supplies

- `injury_markers.position` (`jsonb`, nullable): tọa độ `{ x, y, z }` trên mô hình 3D của ngựa; `body_region` vẫn bắt buộc để lọc/tô theo vùng.
- `supply_items.category`: `FEED` (thức ăn), `MEDICINE` (thuốc), `EQUIPMENT` (dụng cụ); bắt buộc.

## Khu chuồng

### `barns`

- Primary key: `id`. Soft delete bằng `deleted_at`.
- Foreign keys: `head_trainer_id -> users.id` (`ON DELETE SET NULL`).
- `name` unique (`barns_name_uq`, bản ghi chưa xóa). Mỗi khu có tối đa 1 Head Trainer; một Head Trainer có thể phụ trách nhiều khu.
- `stalls.barn_id -> barns.id` (NOT NULL). Migration backfill một khu `Main` nếu đã có stall.
- `head_trainer_id` phải là user `HEAD_TRAINER` `ACTIVE` (kiểm tra ở service). Không đổi role của Head Trainer còn phụ trách khu.

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
- Lifecycle: `ACTIVE ↔ RETIRED`, `ACTIVE → TRANSFERRED` (kết thúc, đóng ownership, hồ sơ chỉ đọc).
- Không set `health_status = ELIGIBLE` khi có `training_locks` `ACTIVE`.
- Chỉ xóa mềm ngựa chưa có lịch sử sở hữu và không là parent của ngựa khác.
- Eligibility: tập khi `ACTIVE`, health `ELIGIBLE`/`UNDER_OBSERVATION`, không lock; đua khi `ACTIVE`, health `ELIGIBLE`, không lock.
- Phạm vi xem: Club Manager, Head Trainer, Veterinarian toàn club; Groom theo `stall_assignments` active; Horse Owner theo `horse_ownerships` active. Head Trainer bị giới hạn thêm theo khu chuồng (xem mục Khu chuồng).

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
