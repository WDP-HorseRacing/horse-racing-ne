# Flow 2 — Lập và thực hiện giáo án huấn luyện

> Cập nhật: 07/10/2026

## I. Đề bài liên quan

**HEAD TRAINER**

- Lập giáo án huấn luyện chi tiết (cự ly, khối lượng, mặt sân) theo từng giai đoạn cho từng con ngựa.
- Phân công lịch tập luyện hằng ngày cho đội ngũ chăm sóc và quản lý lượt chạy thử.
- Xem cảnh báo vượt ngưỡng thể lực hoặc nguy cơ chấn thương dựa trên dữ liệu nhịp tim/vận tốc realtime.
- Đánh giá phong độ, ghi nhận chỉ số buổi tập và đưa ra nhận xét chuyên môn sau mỗi buổi tập.

**HORSE OWNER**: xem lịch trình tập luyện và nhận xét của Head Trainer.

**CLUB MANAGER**: quản lý danh mục, xem báo cáo hiệu suất huấn luyện.

## II. Mô hình

```
LỚP HỌC            HT phụ trách, ngựa ghi danh, ngày bắt đầu – kết thúc
 ├─ GIÁO ÁN        đúng 1 giáo án của HT phụ trách lớp
 │   └─ MÔN HỌC    các môn theo thứ tự, mỗi môn học trong N tuần
 └─ BUỔI TẬP       sinh từ giáo án lúc tạo lớp, có thể chỉnh từng buổi
     └─ LƯỢT TẬP   mỗi ngựa trong lớp một lượt mỗi buổi
         ├─ kết quả chạy thử, đánh giá của HT
         └─ điểm đo nhịp tim/tốc độ (MongoDB)
```

| Khái niệm | Bảng | Ai tạo, sửa | Ghi chú |
|---|---|---|---|
| Môn học | `training_subjects` | Club Manager | Danh mục dùng chung CLB. Mỗi môn là một bài cố định: loại buổi (thường / chạy thử), cường độ, cự ly dự kiến, mặt sân, thời gian mục tiêu (chỉ môn chạy thử). |
| Giáo án | `training_plans`, `training_plan_subjects` | Head Trainer sở hữu | Ghép môn theo thứ tự, mỗi môn bao nhiêu tuần. Dùng lại cho các lớp của chính Head Trainer đó. |
| Lớp học | `training_classes` | Head Trainer | Một lớp theo đúng một giáo án của Head Trainer phụ trách lớp. Ngày kết thúc tự tính. |
| Buổi tập | `training_sessions` | Head Trainer | Thuộc lớp, gắn môn học. Lưu bản chép cường độ, cự ly, mặt sân của môn lúc tạo. |
| Lượt tập | `session_participants` | Hệ thống tạo khi publish buổi hoặc ghi danh | Điểm danh, sẵn sàng, bắt đầu, hoàn thành theo từng ngựa. |

Ngựa cần bài khác nhau thì ghi danh vào các lớp khác nhau; trong một buổi, mọi ngựa cùng một bài.

## III. Luật nghiệp vụ

### 1. Môn học

1. Tên môn duy nhất trong CLB.
2. Môn chạy thử phải có cự ly lớn hơn 0. Môn thường không có thời gian mục tiêu.
3. Môn đang nằm trong giáo án hoặc buổi tập thì không xóa được.
4. Sửa môn không làm đổi các buổi tập đã tạo.

### 2. Giáo án

1. Giáo án thuộc Head Trainer tạo ra. Head Trainer khác không xem, không dùng được. Club Manager xem được mọi giáo án nhưng không tạo, không sửa.
2. Giáo án có ít nhất một môn. Tuần bắt đầu của mỗi môn tính theo thứ tự (môn 1 tuần 1–4 thì môn 2 bắt đầu tuần 5).
3. Sửa giáo án là thay toàn bộ danh sách môn. Lớp đã tạo từ giáo án giữ nguyên buổi tập.
4. Giáo án đã có lớp dùng thì không xóa được.

### 3. Tạo lớp và lịch buổi tập

1. Chỉ Head Trainer tạo lớp, và lớp luôn do chính Head Trainer đó phụ trách.
2. Luồng màn hình tạo lớp:
   1. Head Trainer chọn giáo án, ngày bắt đầu, các thứ trong tuần (bao nhiêu thứ cũng được), giờ bắt đầu theo giờ CLB, thời lượng mỗi buổi.
   2. Hệ thống trả lịch xem trước, chưa lưu gì: tuần thứ n học môn chiếm tuần n trong giáo án; mỗi thứ đã chọn trong tuần sinh một buổi, nội dung lấy từ môn.
   3. Head Trainer chỉnh ngay trên màn hình: đổi giờ, mặt sân, cự ly, cường độ, thời gian mục tiêu; đổi môn của một buổi (ví dụ thêm ngày đi bộ hồi phục hoặc buổi chạy thử cuối giai đoạn); bỏ buổi.
   4. Bấm Tạo lớp: lớp và mọi buổi được lưu trong một lần. Lỗi ở bất kỳ buổi nào thì không lưu gì.
3. Ngày kết thúc lớp = ngày bắt đầu + tổng số tuần của giáo án − 1 ngày.
4. Mỗi buổi phải nằm trong thời gian của lớp, so theo ngày lịch CLB (giờ Việt Nam).
5. Loại buổi lấy theo môn của buổi. Buổi chạy thử được tạo sẵn cấu hình chạy thử (cự ly, thời gian mục tiêu).
6. Lớp và buổi tạo ra ở trạng thái nháp. Head Trainer kích hoạt lớp rồi publish buổi (từng buổi, theo khoảng ngày hoặc cả lớp).
7. Đổi ngày bắt đầu của lớp thì ngày kết thúc tự tính lại; buổi nằm ngoài khoảng mới thì chặn.
8. Lớp không đổi được giáo án hay Head Trainer sau khi tạo. Đổi Head Trainer chỉ qua bàn giao (mục 7).

### 4. Buổi tập và chạy thử

1. Thêm, sửa buổi khi lớp còn nháp hoặc đang chạy. Lớp đã hoàn thành hoặc đã hủy thì không.
2. Sửa buổi và sửa cấu hình chạy thử chỉ khi buổi còn nháp.
3. Publish buổi: lớp phải đang chạy; buổi chạy thử phải có cấu hình chạy thử. Publish tạo lượt tập cho từng ngựa đang học lớp.
4. Publish nhiều buổi một lần: mọi buổi nháp của lớp, hoặc chỉ các buổi có ngày bắt đầu (lịch CLB) trong khoảng `from`–`to` (ví dụ một tuần). Một buổi lỗi thì không buổi nào được publish.
5. Ghi danh ngựa vào lớp đang chạy: tạo lượt cho các buổi đã publish trong tương lai.

### 5. Ngựa có được tập buổi này không

Áp ở publish buổi, ghi danh, điểm danh và bắt đầu lượt:

1. Ngựa đang bị khóa huấn luyện: lượt thành Hủy do khóa (`CANCELLED_BY_LOCK`).
2. Ngựa không được tập (chấn thương, cách ly, giải nghệ...): lượt thành Không đủ điều kiện (`INELIGIBLE`).
3. Ngựa Cần theo dõi gặp buổi cường độ Nặng: lượt thành Không đủ điều kiện, lý do `HEALTH_UNDER_OBSERVATION`. Buổi Nhẹ và Trung bình tập bình thường.
4. Điểm danh hoặc bắt đầu bị chặn thì vẫn lưu trạng thái trên rồi báo lỗi 409.
5. Bắt đầu lượt cần lớp đang chạy.

### 6. Nhịp tim và tốc độ (dữ liệu giả lập)

1. Không có thiết bị đo thật; script `pnpm sim` đóng vai cảm biến, mỗi giây gửi một điểm đo.
2. Chỉ nhận điểm đo khi lượt đang tập (`ONGOING`). Điểm trùng cảm biến và thời điểm đo bị bỏ qua.
3. Ngưỡng mặc định CLB: nhịp tim cảnh báo 220 bpm, nguy hiểm 240 bpm, tốc độ tối đa 18 m/s. Head Trainer của khu đặt ngưỡng riêng cho từng ngựa theo phiên bản có khoảng hiệu lực.
4. Mức cảnh báo mỗi điểm: vượt ngưỡng nguy hiểm là `CRITICAL`; vượt ngưỡng cảnh báo nhịp tim hoặc tốc độ tối đa là `WARNING`; còn lại `NORMAL`.
5. Head Trainer của lớp nhận điểm đo realtime qua socket, sự kiện `performance.metrics`.
6. Có điểm `CRITICAL`: thông báo KHẨN cho mọi bác sĩ và Head Trainer của lớp, mỗi lượt tập một lần.
7. Khối lượng tập của ngựa (`GET /horses/:id/workload?from&to`, mặc định 7 ngày gần nhất theo lịch CLB): chỉ tính lượt đã hoàn thành có buổi trong khoảng ngày; trả số lượt, số lượt theo cường độ, tổng cự ly dự kiến, tổng thời lượng thực (bắt đầu tới hoàn thành) và cự ly thực tính từ tốc độ cảm biến (khoảng giữa hai điểm đo tính tối đa 5 giây). Ai xem được hồ sơ ngựa thì xem được.

### 7. Bàn giao khi Head Trainer nghỉ

1. Club Manager bàn giao một lần: mọi khu chuồng, mọi giáo án và mọi lớp nháp/đang chạy của Head Trainer A sang Head Trainer B, trong một transaction. Lớp đã hoàn thành hoặc đã hủy giữ A để tra lịch sử.
2. Mỗi khu được chuyển ghi một dòng nhật ký.
3. Không khóa tài khoản hay đổi vai trò Head Trainer còn khu chuồng, còn giáo án, hoặc còn lớp nháp/đang chạy.

### 8. Phân quyền

| Thao tác | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Danh mục môn học | Thêm, sửa, xóa, xem | Xem | Xem | Xem | Không |
| Giáo án | Xem tất cả | Của mình | Không | Không | Không |
| Lớp, buổi tập (xem) | Tất cả | Lớp mình phụ trách | Tất cả | Lớp có lượt mình dắt | Lớp có ngựa của mình |
| Tạo, sửa lớp, buổi, chạy thử, ghi danh, publish | Không | Lớp mình phụ trách | Không | Không | Không |
| Điểm danh, bắt đầu, hoàn thành lượt, kết quả chạy thử | Không | Lớp mình phụ trách, ngựa thuộc khu mình | Không | Lượt mình được giao | Không |
| Đánh giá buổi | Không | Có | Không | Không | Không |
| Ngưỡng nhịp tim/tốc độ | Xem, đặt | Ngựa thuộc khu mình | Xem | Không | Không |
| Bàn giao Head Trainer | Có | Không | Không | Không | Không |

## IV. API

| Phương thức | Đường dẫn | Ai gọi | Công dụng |
|---|---|---|---|
| GET | `/training-subjects` | CM, HT, VET, GROOM | Danh mục môn |
| GET | `/training-subjects/:subjectId` | CM, HT, VET, GROOM | Một môn |
| POST | `/training-subjects` | CM | Thêm môn |
| PATCH | `/training-subjects/:subjectId` | CM | Sửa môn (gửi `null` để xóa field tùy chọn) |
| DELETE | `/training-subjects/:subjectId` | CM | Xóa môn chưa dùng |
| GET | `/training-plans` | HT (của mình), CM | Danh sách giáo án kèm môn, `totalWeeks` |
| GET | `/training-plans/:id` | HT (của mình), CM | Một giáo án |
| POST | `/training-plans` | HT | Tạo giáo án `{ name, description?, subjects: [{ subjectId, weeks }] }` |
| PUT | `/training-plans/:id` | HT (của mình) | Thay toàn bộ giáo án |
| DELETE | `/training-plans/:id` | HT (của mình) | Xóa giáo án chưa có lớp |
| POST | `/classes/schedule-preview` | HT | Xem trước lịch `{ planId, startDate, weekdays, startTime, durationMinutes }` |
| POST | `/classes` | HT | Tạo lớp kèm buổi `{ code, name, ..., planId, startDate, sessions: [...] }` |
| PATCH | `/classes/:classId` | HT | Sửa lớp (không đổi giáo án, Head Trainer) |
| PATCH | `/classes/:classId/status` | HT | Kích hoạt, hoàn thành, hủy lớp |
| GET/POST | `/classes/:classId/sessions` | Xem: theo quyền xem lớp; thêm: HT | Buổi của lớp |
| PATCH | `/training-sessions/:sessionId` | HT | Sửa buổi nháp, đổi được `subjectId` |
| POST | `/training-sessions/:sessionId/publish` | HT | Publish buổi |
| POST | `/classes/:classId/sessions/publish` | HT | Publish nhiều buổi nháp `{ from?, to? }` |
| PATCH | `/training-sessions/:id/time-trial` | HT | Sửa cấu hình chạy thử của buổi nháp |
| POST | `/session-participants/:id/check-in`, `/ready`, `/start`, `/complete`, `/absent` | HT, GROOM | Thao tác lượt tập |
| POST | `/session-participants/:id/metrics`, `/metrics/batch` | Không cần đăng nhập | Nhận điểm đo (giả lập) |
| GET | `/session-participants/:id/metrics` | CM, VET, HT, GROOM | Điểm đo của lượt theo thời gian |
| GET | `/session-participants/:id/performance-summary` | Ai xem được lượt | Tổng kết nhịp tim, tốc độ, số cảnh báo |
| GET | `/horses/:id/workload` | Ai xem được hồ sơ ngựa | Khối lượng tập `?from&to` |
| GET/PUT | `/horses/:id/thresholds` | Xem: HT, CM, VET; đặt: HT, CM | Ngưỡng của ngựa |
| POST | `/users/:id/head-trainer-handover` | CM | Bàn giao Head Trainer `{ toHeadTrainerId }` |

Chi tiết schema: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

## Phụ lục 1: Thay đổi API cần báo FE

1. Bỏ: `GET/POST /training-classes/:classId/plans`, `POST /training-plans/:id/activate|complete|cancel`, `GET/POST /training-plans/:id/sessions`.
2. Giáo án đổi hẳn dạng: không còn `classId`, `phaseName`, `goal`, `startDate`, `endDate`, `status`; có `description`, `headTrainerId`, `totalWeeks`, `subjects[]`. Sửa bằng `PUT`.
3. Tạo lớp: bắt buộc `planId`, `sessions`; bỏ `endDate` (tự tính) và `headTrainerId` (luôn là người gọi). Response lớp có `planId`.
4. Buổi tập: bắt buộc `intensity` (`LIGHT` / `MODERATE` / `HEAVY`) và `plannedDistanceM`; có `subjectId`; response có `classId`, `subjectId`, bỏ `planId`. Danh sách và thêm buổi qua `/classes/:classId/sessions`.
5. Tab Huấn luyện của ngựa: `phaseName` đổi thành `subjectName` (có thể `null`).
6. Club Manager không còn gọi được các thao tác ghi của lớp, buổi, lượt tập, kết quả chạy thử, đánh giá (nhận 403).
7. API mới: môn học, xem trước lịch, publish nhiều buổi, sửa chạy thử, khối lượng tập, ngưỡng, điểm đo, tổng kết lượt, bàn giao Head Trainer; sự kiện socket `performance.metrics`; loại thông báo `PERFORMANCE_ALERT`, đích `SESSION_PARTICIPANT`.

## Phụ lục 2: Việc còn lại

- `GET /horses/:id/alerts` (lịch sử cảnh báo thể lực của ngựa) còn trả 501.
- Route nhận điểm đo đang public: nợ mục 10 ở `docs/mongo-notifications-debt.md`.
