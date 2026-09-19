# Flow 2 — Lập và thực hiện giáo án huấn luyện

## 1. Mục tiêu

Flow này quản lý toàn bộ vòng đời huấn luyện của một ngựa, từ lúc Head Trainer lập giáo án, chia thành các buổi tập, giao Groom thực hiện, ghi nhận kết quả thực tế, đến khi Trainer đánh giá và đóng giáo án.

Hai khái niệm chính được tách riêng:

- `TrainingPlan`: giáo án tổng thể của một ngựa trong một giai đoạn.
- `TrainingSession`: một buổi tập cụ thể thuộc giáo án.

Các dữ liệu phát sinh trong lúc tập:

- `TimeTrial`: kết quả một lần chạy thử trong session.
- `PerformanceMetric`: telemetry do module Performance tiếp nhận.
- `PerformanceEvaluation`: đánh giá cuối buổi của Head Trainer hoặc Club Manager.

### Cấu trúc triển khai

Training được chia theo capability thay vì đặt toàn bộ nghiệp vụ trong một service:

- `plans`: vòng đời giáo án và transaction tác động các session con.
- `sessions`: lên lịch và thực hiện từng buổi tập.
- `time-trials`: kết quả các lần chạy thử.
- `evaluations`: đánh giá chuyên môn sau buổi tập.
- `shared`: kiểm tra actor, phạm vi CLB và quyền thao tác session.

`TrainingModule` chỉ làm composition root, import bốn feature module trên. Mỗi feature có controller, service và repository riêng; các state rule thuần túy nằm trong `policies`.

## 2. Vai trò và quyền

| Hành động                                | CLUB_MANAGER | HEAD_TRAINER | GROOM                 |
| ---------------------------------------- | ------------ | ------------ | --------------------- |
| Xem giáo án, session và kết quả          | Có           | Có           | Có                    |
| Tạo/sửa/kích hoạt/hủy/đóng giáo án       | Có           | Có           | Không                 |
| Tạo, đổi lịch hoặc đổi Groom của session | Có           | Có           | Không                 |
| Start/complete/cancel session            | Có           | Có           | Chỉ session được giao |
| Ghi time trial                           | Có           | Có           | Chỉ session được giao |
| Đánh giá session                         | Có           | Có           | Không                 |

Mọi thao tác đều bị giới hạn trong CLB của user đang đăng nhập. Khi tài nguyên thuộc CLB khác, API trả `404` để không làm lộ sự tồn tại của dữ liệu.

## 3. State machine

### Training plan

```text
SCHEDULED ──activate──> ACTIVE ──complete──> COMPLETED
     │                    │
     └──────cancel────────┴──────cancel────> CANCELLED
```

- Plan mới luôn là `SCHEDULED`.
- Chỉ `SCHEDULED` được chỉnh sửa.
- Plan phải có ít nhất một session trước khi activate.
- Một ngựa chỉ được có một plan `ACTIVE`.
- Plan chỉ hoàn thành khi không còn session mở và có ít nhất một session `COMPLETED`.
- Không cho cancel plan nếu còn session `IN_PROGRESS`.

### Training session

```text
SCHEDULED ──start──> IN_PROGRESS ──complete──> COMPLETED
     │                    │
     └──────cancel────────┴──────cancel──────> CANCELLED
```

- Chỉ session `SCHEDULED` được đổi lịch hoặc đổi Groom.
- Session chỉ được start khi plan `ACTIVE`.
- Session chỉ được complete khi đang `IN_PROGRESS`.
- `COMPLETED` và `CANCELLED` là trạng thái kết thúc, không thể mở lại.

## 4. Kiểm tra an toàn khi bắt đầu tập

`POST /sessions/:id/start` thực hiện trong database transaction và khóa row session. Trước khi chuyển trạng thái, hệ thống kiểm tra:

1. Session đang `SCHEDULED`.
2. Plan đang `ACTIVE`.
3. Groom hiện tại đúng là người được giao, trừ khi caller là Head Trainer hoặc Club Manager.
4. Ngựa thuộc cùng CLB.
5. Lifecycle của ngựa là `ACTIVE`.
6. Health status của ngựa là `ELIGIBLE`.
7. Không tồn tại `TrainingLock` trạng thái `ACTIVE`.
8. Ngựa không có session khác đang `IN_PROGRESS`.

Row lock ngăn hai request đồng thời cùng start một session. Kiểm tra session đang chạy ngăn một ngựa thực hiện hai buổi tập cùng lúc.

## 5. API giáo án

Tất cả endpoint dùng prefix `/api/v1` và yêu cầu Bearer access token.

### `GET /horses/:horseId/training-plans`

Liệt kê giáo án của một ngựa, mới nhất trước.

- Kiểm tra ngựa thuộc CLB của caller.
- Trả `200` với mảng plan.
- Trả `404` nếu không tìm thấy ngựa trong CLB.

### `POST /horses/:horseId/training-plans`

Tạo giáo án mới ở trạng thái `SCHEDULED`.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Body:

```json
{
  "phaseName": "Tăng sức bền giai đoạn 1",
  "goal": "Hoàn thành 5 km với nhịp tim ổn định",
  "startDate": "2026-09-20",
  "endDate": "2026-10-20"
}
```

Rule:

- `startDate <= endDate`.
- Ngựa phải thuộc cùng CLB.
- Người tạo được lấy từ access token, client không được truyền `createdBy`.

Kết quả: `201` cùng plan vừa tạo.

### `GET /training-plans/:id`

Lấy chi tiết một giáo án.

- Trả `200` nếu plan thuộc CLB của caller.
- Trả `404` nếu không tồn tại hoặc thuộc CLB khác.

### `PATCH /training-plans/:id`

Cập nhật tên giai đoạn, mục tiêu hoặc khoảng ngày.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Chỉ plan `SCHEDULED` được sửa. Nếu thay khoảng ngày, tất cả session đã tạo phải vẫn nằm trong khoảng mới.

Body có thể chứa một phần các trường của endpoint tạo plan.

Lỗi đáng chú ý:

- `400`: khoảng ngày không hợp lệ.
- `409`: plan không còn `SCHEDULED`, hoặc khoảng mới loại bỏ session đã lên lịch.

### `POST /training-plans/:id/activate`

Chuyển plan từ `SCHEDULED` sang `ACTIVE`.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Điều kiện:

- Plan có ít nhất một session.
- Ngựa chưa có plan `ACTIVE` khác.

Khi thành công, hệ thống ghi `activatedAt` và phát event `training.plan.activated` sau khi transaction commit.

### `POST /training-plans/:id/complete`

Đóng giáo án thành `COMPLETED`.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Điều kiện:

- Plan đang `ACTIVE`.
- Không còn session `SCHEDULED` hoặc `IN_PROGRESS`.
- Có ít nhất một session `COMPLETED`.

Khi thành công, hệ thống ghi `completedAt` và phát event `training.plan.completed`.

### `POST /training-plans/:id/cancel`

Hủy giáo án.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Body:

```json
{
  "reason": "Thay đổi mục tiêu thi đấu"
}
```

Rule:

- Không hủy plan đã `COMPLETED` hoặc `CANCELLED`.
- Không hủy khi còn session `IN_PROGRESS`; cần complete hoặc cancel session đó trước.
- Các session `SCHEDULED` còn lại được chuyển thành `CANCELLED` trong cùng transaction.
- Lưu `cancelledAt`, `cancelReason` và người hủy trên từng session.

## 6. API session

### `POST /training-plans/:id/sessions`

Thêm một buổi tập vào plan.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Body:

```json
{
  "scheduledAt": "2026-09-22T07:00:00+07:00",
  "distanceKm": 5,
  "plannedDurationMinutes": 45,
  "intensity": "MODERATE",
  "surface": "DIRT",
  "groomId": "00000000-0000-0000-0000-000000000000"
}
```

Rule:

- Plan phải là `SCHEDULED` hoặc `ACTIVE`.
- Ngày session phải nằm trong khoảng ngày của plan.
- `groomId`, nếu có, phải là user role `GROOM` thuộc cùng CLB.
- `distanceKm >= 0`, `plannedDurationMinutes >= 1`.

Kết quả: `201`, session ở trạng thái `SCHEDULED`.

### `GET /training-plans/:id/sessions`

Liệt kê session của plan theo `scheduledAt` tăng dần.

Kết quả: `200` với mảng session.

### `GET /sessions/:id`

Lấy chi tiết một session, gồm dữ liệu dự kiến, dữ liệu thực tế và thông tin hủy nếu có.

### `PATCH /sessions/:id`

Đổi lịch, bài tập hoặc Groom phụ trách.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Chỉ session `SCHEDULED` được sửa. Các rule ngày nằm trong plan và Groom cùng CLB vẫn được áp dụng.

### `POST /sessions/:id/start`

Bắt đầu thực hiện session.

Quyền: Groom được giao, `HEAD_TRAINER`, hoặc `CLUB_MANAGER`.

Không có request body. Thành công sẽ:

- Chuyển status thành `IN_PROGRESS`.
- Ghi `startedAt` theo thời gian server.
- Phát event `training.session.started`.

Các kiểm tra y tế và đồng thời được mô tả ở mục 4. Vi phạm business rule trả `409`; Groom không được giao trả `403`.

### `POST /sessions/:id/complete`

Hoàn thành session và ghi kết quả thực tế.

Quyền: Groom được giao, `HEAD_TRAINER`, hoặc `CLUB_MANAGER`.

Body:

```json
{
  "actualDistanceKm": 4.8,
  "actualDurationSeconds": 2460,
  "perceivedEffort": 7,
  "notes": "Ngựa giảm tốc ở 500 m cuối"
}
```

Chỉ session `IN_PROGRESS` được complete. Thành công sẽ ghi `completedAt`, chuyển status thành `COMPLETED` và phát event `training.session.completed`.

`distanceKm` là bài được giao; `actualDistanceKm` là kết quả thực tế. Hai giá trị không ghi đè nhau để báo cáo có thể so sánh kế hoạch và thực hiện.

### `POST /sessions/:id/cancel`

Hủy một session chưa kết thúc.

Quyền: Groom được giao, `HEAD_TRAINER`, hoặc `CLUB_MANAGER`.

Body:

```json
{
  "reason": "Thời tiết không đảm bảo"
}
```

Cho phép từ `SCHEDULED` hoặc `IN_PROGRESS`. Hệ thống lưu `cancelledAt`, `cancelledBy`, `cancelReason` và phát event `training.session.cancelled`.

## 7. API time trial

### `POST /sessions/:id/time-trials`

Ghi một lần chạy thử trong session.

Quyền: Groom được giao, `HEAD_TRAINER`, hoặc `CLUB_MANAGER`.

Body:

```json
{
  "distanceMeters": 1000,
  "durationSeconds": 65.421,
  "videoAssetId": "00000000-0000-0000-0000-000000000000",
  "notes": "Lần chạy thứ nhất"
}
```

Rule:

- Session phải đang `IN_PROGRESS`.
- Media, nếu có, phải thuộc cùng CLB.
- Một session có thể có nhiều time trial.

### `GET /sessions/:id/time-trials`

Liệt kê time trial của session theo thứ tự tạo tăng dần.

### `GET /time-trials/:id`

Lấy một kết quả time trial và tham chiếu media. API vẫn kiểm tra gián tiếp CLB qua session → plan → horse.

## 8. API đánh giá

### `POST /sessions/:id/evaluation`

Tạo đánh giá chuyên môn cho session đã hoàn thành.

Quyền: `HEAD_TRAINER`, `CLUB_MANAGER`.

Body:

```json
{
  "score": 8,
  "comment": "Đạt mục tiêu sức bền, cần cải thiện đoạn cuối"
}
```

Rule:

- Session phải `COMPLETED`.
- Điểm từ 1 đến 10.
- Mỗi session chỉ có một evaluation; unique constraint tại database bảo vệ rule này.

### `GET /sessions/:id/evaluation`

Lấy đánh giá của session.

- Trả `200` nếu có.
- Trả `404` nếu session chưa được đánh giá.

## 9. Mã lỗi chung

| HTTP  | Ý nghĩa                                                                                    |
| ----- | ------------------------------------------------------------------------------------------ |
| `400` | Body, UUID, ngày tháng hoặc dữ liệu nghiệp vụ đầu vào không hợp lệ                         |
| `401` | Thiếu hoặc access token không hợp lệ                                                       |
| `403` | Role không đủ quyền hoặc Groom không được giao session                                     |
| `404` | Không tìm thấy tài nguyên trong phạm vi CLB                                                |
| `409` | State transition không hợp lệ, training lock, health không phù hợp hoặc xung đột đồng thời |

## 10. Event phát sau thay đổi trạng thái

- `training.plan.activated`
- `training.plan.completed`
- `training.plan.cancelled`
- `training.session.started`
- `training.session.completed`
- `training.session.cancelled`

Event được phát sau khi database transaction thành công. Consumer có thể dùng chúng để tạo notification, cập nhật dashboard hoặc gửi realtime event mà không đặt logic đó trực tiếp trong Training service.

## 11. Index

Flow hiện không khai báo index tối ưu query mang tính dự đoán. Unique index của evaluation vẫn được giữ để bảo vệ một đánh giá trên mỗi session. Sau khi có dữ liệu và đo bằng `EXPLAIN ANALYZE`, các ứng viên đầu tiên cần xem xét là:

- `training_plans(horse_id, status)`;
- `training_sessions(plan_id, scheduled_at)`;
- `training_sessions(groom_id, status, scheduled_at)`.

Chỉ thêm khi workload thật chứng minh cần thiết.
