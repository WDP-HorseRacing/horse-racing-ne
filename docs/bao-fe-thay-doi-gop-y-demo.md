# Thay đổi API cần FE cập nhật (đợt sửa theo góp ý demo)

Cập nhật: 2026-10-16

Mọi path có tiền tố `/api/v1`. Vai trò viết tắt: CM = Club Manager, HT = Head Trainer, VET = bác sĩ thú y, GROOM = người chăm ngựa, OWNER = chủ ngựa. Lỗi vẫn theo format chung. Schema chi tiết: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

## 1. Lớp học: xếp lịch kiểu lịch tuần, bỏ nháp

1. **Môn học** có thêm `durationMinutes` (phút, 15–480): bắt buộc khi tạo, tùy chọn khi sửa; response luôn có.
2. **Giáo án** bỏ `weekdays` (thứ trong tuần), thay bằng số buổi tối thiểu mỗi tuần:
   - Body `POST`/`PUT /training-plans`: `phases: [{ weeks, subjects: [{ subjectId, minSessionsPerWeek }] }]`, `minSessionsPerWeek` 1–14. Gửi `weekdays` là 400.
   - Response giáo án và từng giai đoạn có thêm `minTotalMinutes` = số tuần × tổng (số buổi tối thiểu × thời lượng môn).
3. **Tạo lớp** chỉ cần `code`, `name`, `planId`, `startDate`. Bỏ `sessions` trong body; lớp tạo ra chưa có buổi nào.
   - Lớp chép giáo án lúc tạo. Sau đó sửa giáo án không làm đổi lớp.
   - Lớp tạo ra là `ACTIVE` luôn. Bỏ trạng thái `DRAFT` của lớp và buổi.
   - `PATCH /classes/:classId/status` chỉ nhận `COMPLETED` hoặc `CANCELLED` (gửi `ACTIVE` là 400).
4. **Bỏ route**:
   - `POST /classes/schedule-preview`
   - `POST /classes/:classId/sessions/publish`
   - `POST /training-sessions/:sessionId/publish`

   Buổi lưu xong là `SCHEDULED` và có hiệu lực ngay.
5. **Route mới**:
   - `GET /classes/:classId/plan`: giáo án của lớp, có khoảng ngày của từng giai đoạn.

     ```json
     {
       "classId": "uuid", "planId": "uuid", "minTotalMinutes": 360,
       "phases": [
         { "position": 1, "weeks": 2, "startDate": "2027-01-04", "endDate": "2027-01-17", "minTotalMinutes": 360,
           "subjects": [{ "subject": { "id": "uuid", "name": "Sức bền", "durationMinutes": 60, "...": "giống response môn học" }, "minSessionsPerWeek": 3 }] }
       ]
     }
     ```

   - `GET /classes/:classId/progress`: tiến độ xếp lịch theo tuần, để tô màu thiếu hoặc đủ. Thiếu hay vượt đều không bị chặn.

     ```json
     {
       "classId": "uuid", "minTotalMinutes": 360, "scheduledMinutes": 120,
       "weeks": [
         { "week": 1, "phasePosition": 1, "startDate": "2027-01-04", "endDate": "2027-01-10",
           "subjects": [{ "subjectId": "uuid", "subjectName": "Sức bền", "minSessions": 3, "scheduledSessions": 2 }] }
       ]
     }
     ```

   - `POST /classes/:classId/sessions/bulk`: thêm nhiều buổi một lần (dùng cho nút "lặp lại hằng tuần" trên lịch).
     - Body `{ "sessions": [ ...giống body thêm một buổi ] }`, 1–100 buổi.
     - Một buổi lỗi thì không lưu buổi nào. Câu báo có tiền tố `Buổi N: `, ô lỗi là `sessions.{i}`.
   - `GET /classes/:classId/enrollable-horses`: ngựa ghi danh được vào lớp lúc này, trả `[{ horseId, horseName, horsePhotoUrl }]`. Đã tự loại ngựa đã ghi danh, ngựa trùng giờ và ngựa vượt giới hạn tập trong ngày (mục 2).
6. **Luật mới khi thêm hoặc sửa buổi**: môn của buổi phải có trong giai đoạn của lớp chứa ngày đó. Sai thì 409 `Môn {tên} không có trong giai đoạn {n} của lớp`.
7. Sửa buổi (kéo đổi giờ, đổi môn...) và sửa cấu hình chạy thử chỉ được khi buổi `SCHEDULED` và chưa tới giờ mở điểm danh (30 phút trước giờ bắt đầu). Các trường hợp khác: 409 `Chỉ sửa được buổi tập đã lên lịch, trước giờ mở điểm danh (30 phút trước giờ bắt đầu)`. FE nên khóa kéo thả buổi từ mốc này.
8. Điểm danh, báo vắng, sẵn sàng, bắt đầu trên buổi đã hoàn thành hoặc đã hủy: câu báo 409 đổi thành `Buổi tập đã kết thúc hoặc đã hủy, không thao tác được`.

## 2. Cường độ chỉ còn Nhẹ và Nặng, có giới hạn tập trong ngày

1. Bỏ `MODERATE`. `intensity` chỉ còn `LIGHT` hoặc `HEAVY`, ở môn, buổi, tab huấn luyện của ngựa và báo cáo. Dữ liệu cũ `MODERATE` đã chuyển thành `HEAVY`.
   - `GET /horses/:id/workload` và dashboard: object đếm theo cường độ chỉ còn `LIGHT`, `HEAVY`.
2. Ngựa Cần theo dõi chỉ tập buổi Nhẹ. Ngựa bị khóa huấn luyện không tập mức nào.
3. Mỗi ngựa: tối đa 2 buổi một ngày (lịch CLB), tối đa 1 buổi Nặng một ngày, hai buổi bất kỳ cách nhau ít nhất 3 giờ. Xét mọi lớp của ngựa.
4. Kiểm khi thêm buổi, sửa buổi và ghi danh. Vi phạm là 409, ví dụ:
   - Ngựa vướng lịch ở lớp khác: `Vượt giới hạn tập trong ngày của ngựa: Winx đã có buổi Nặng trong ngày (lớp K2, 08:00 ngày 05/01/2027)`
   - Buổi vướng chính các buổi của lớp này: `Buổi vượt giới hạn tập trong ngày của lớp: đã đủ 2 buổi trong ngày (lớp K1, 14:00 ngày 05/01/2027)`
   - Ba cách vượt: `đã có buổi Nặng trong ngày`, `đã đủ 2 buổi trong ngày`, `chưa nghỉ đủ 3 giờ so với buổi khác`.

## 3. Lượt tập bị treo và vòng đời ngựa

1. Lượt đang tập (`ONGOING`) ở buổi đã quá giờ kết thúc 30 phút: hệ thống tự chuyển `COMPLETED`, lý do `Hệ thống tự hoàn thành`.
2. Ngựa được ghi nhận đã mất khi đang tập: lượt chuyển `CANCELLED`, lý do `Ngựa đã mất`.
3. Giải nghệ hoặc chuyển nhượng khi ngựa còn lượt đang tập: 409 `Ngựa đang tập, chờ hoàn thành lượt tập rồi mới giải nghệ hoặc chuyển nhượng`.

## 4. Phụ phí chăm sóc riêng (thay cho "gói chăm sóc")

1. Không có gói. Chi phí của chủ = phí ngày chung + phụ phí riêng từng ngựa + chi phí y tế.
2. Route mới:

   | Method | Path | Ai gọi | Ghi chú |
   |---|---|---|---|
   | GET | `/horses/:horseId/surcharges` | CM, OWNER (ngựa của mình), HT (ngựa trong khu mình) | GROOM không xem được |
   | POST | `/horses/:horseId/surcharges` | CM | Body `{ description (≤500 ký tự), dailyAmount (VND/ngày, > 0), startDate, endDate }` |
   | POST | `/horse-surcharges/:id/apply` | HT khu hiện tại của ngựa | Bấm "Đã áp dụng", mỗi khoản một lần (lần hai 409) |
   | POST | `/horse-surcharges/:id/end` | CM | Kết thúc sớm, tính tới hết hôm nay |
   | DELETE | `/horse-surcharges/:id` | CM | Chỉ khi chưa tới ngày bắt đầu (409 nếu đã bắt đầu) |
   | GET | `/horse-surcharges/unapplied` | CM | Khoản HT chưa xác nhận, kèm `horseName`, `barnName`, `headTrainerName` (`null` là chưa có khu hoặc chưa có HT) |

   Response một khoản: `{ id, horseId, description, dailyAmount, startDate, endDate, createdBy, createdAt, appliedBy, appliedByName, appliedAt }`. Chưa xác nhận thì 3 trường `applied*` là `null`.
3. Ghi phụ phí xong, HT khu của ngựa và chủ ngựa nhận thông báo loại mới `SURCHARGE`.
4. Báo cáo có thêm số `surcharge`, đã cộng vào `total`:
   - `GET /reports/owner/costs`: cả tổng và từng ngựa.
   - `GET /reports/club/finance`: theo từng chủ.
5. Báo cáo "định kỳ": FE cho chọn khoảng ngày (ví dụ từng tháng) rồi gọi hai route báo cáo trên với `from`, `to`. Hệ thống không tự gửi báo cáo theo lịch.

## 5. Chủ ngựa nhận thêm thông báo

Hộp thông báo của OWNER giờ có thêm các loại sau. Không có route mới, chỉ là thêm thông báo:

1. Đặt và gỡ khóa huấn luyện (`TRAINING_LOCK`).
2. Ngựa chuyển sang Cần theo dõi, hoặc về Đủ điều kiện (`HEALTH_STATUS`).
3. Cảnh báo sốt, sụt cân (`MEASUREMENT_ALERT`).
4. Chỉ số tập vượt ngưỡng nguy hiểm (`PERFORMANCE_ALERT`, mức HIGH).
5. Giải nghệ, chuyển nhượng, kích hoạt lại (`HORSE_LIFECYCLE`).
6. Phụ phí mới (`SURCHARGE`).

## 6. Nhật ký đăng nhập

1. Nhật ký thao tác (`GET /audit-logs`) có thêm hai `action` mới: `LOGIN_FAILED` và `PASSWORD_CHANGE`, kèm `feature` mới `AUTH`.
   - `LOGIN` và `LOGOUT` giờ được ghi thật.
   - Đăng nhập sai chỉ ghi khi email có tài khoản trong hệ thống. Dòng đó có `actor` là `null` và `entityId` là tài khoản bị thử.
2. Keycloak bật chống dò mật khẩu: sai 5 lần liên tiếp thì tài khoản bị khóa tạm (khóa thêm 60 giây mỗi lần sai, tối đa 15 phút), sau đó tự mở. Trong lúc bị khóa, `POST /auth/login` vẫn trả 401.

## 7. Chấn thương bắt buộc tọa độ 3D

1. Khi ghi chấn thương trong buổi khám, `injuries[].position` `{ x, y, z }` (số) là bắt buộc. Thiếu, gửi `null` hoặc thiếu một trục đều là 400.
2. Response chấn thương và diễn biến chấn thương luôn có `position`, không còn `null`.

## 8. Chủ sở hữu và tạo ngựa

1. `POST /horses`: `ownerId` (UUID tài khoản HORSE_OWNER đang hoạt động) và `microchipId` (đúng 15 chữ số) giờ **bắt buộc**. Thiếu, `null` hoặc sai định dạng: 400 gắn đúng ô. `PATCH /horses/:horseId` không đổi.
2. Trùng số chip (tạo hoặc sửa): 409, câu báo nêu tên, tình trạng con đang giữ số chip và cách xử lý; `errors[0].conflictId` là id con đó để FE hiện nút mở hồ sơ.

   ```json
   {
     "code": 409,
     "message": "Số chip trùng với ngựa Winx (Đã chuyển nhượng). Dùng kích hoạt lại thay vì tạo mới",
     "errors": [{ "field": "microchipId", "message": "Số chip trùng với ngựa Winx (Đã chuyển nhượng). Dùng kích hoạt lại thay vì tạo mới", "conflictId": "uuid" }]
   }
   ```

   - Trùng hồ sơ đã xóa: "... (hồ sơ đã xóa). Khôi phục hồ sơ đó thay vì tạo mới". Các trường hợp khác (và khi sửa hồ sơ): "... Kiểm tra lại số chip".
3. Đổi vòng đời sang `TRANSFERRED` (bán ra ngoài): kết thúc giai đoạn sở hữu và bỏ trống chủ (`ownerId` của ngựa thành `null`). Chủ cũ không nhận thông báo.
4. Kích hoạt lại từ `TRANSFERRED` (`PATCH /horses/:horseId/lifecycle-status` với `lifecycleStatus = ACTIVE`): body **bắt buộc** `ownerId` (HORSE_OWNER đang hoạt động), thiếu là 400; gửi `ownerId` ở mọi trường hợp khác là 400. Kích hoạt lại từ `RETIRED` giữ nguyên chủ.
   - Xem trước (`GET /horses/:horseId/lifecycle-status/preview`): thêm `ownerRequired` (true khi phải chọn chủ). `ownerCleared` giờ là tên chủ sẽ kết thúc sở hữu khi chuyển nhượng ra ngoài (null nếu giữ chủ).
5. Route mới cho chủ cũ, chỉ HORSE_OWNER:
   - `GET /past-horses`: các con mình từng sở hữu, đã kết thúc giai đoạn (chuyển nhượng nội bộ hoặc bán ra ngoài), không còn là chủ hiện tại, bỏ hồ sơ đã xóa. Mỗi dòng: `{ horseId, name, photoUrl, periods: [{ startedAt, endedAt }] }`, mới nhất trước.
   - `GET /past-horses/:horseId`: thêm `gender`, `dateOfBirth`, `color`, `ancestors` (phả hệ 2 đời, chỉ tên, `canOpen` luôn false). Không từng sở hữu hoặc đang là chủ hiện tại: 404.
   - Không trả chủ mới, khu, ô, sức khỏe, khóa tập. Các tab khác của hồ sơ ngựa vẫn chỉ cho chủ hiện tại.
6. `GET /reports/club/finance` có thêm `unowned`: phần của các ngày ngựa ở CLB mà không có chủ (còn xảy ra khi khôi phục hồ sơ đã xóa mà chủ cũ không còn hoạt động), cộng chi phí bệnh án đóng lúc ngựa không có chủ. Không có thì các số bằng 0.

   ```json
   "unowned": { "billedDays": 4, "dailyFee": 800000, "medicalCost": 300000, "surcharge": 80000, "total": 1180000 }
   ```

   - `billedDays`: tổng số ngày tính phí (mỗi ngựa mỗi ngày tính một). `ownerCharges` = tổng `owners` + `unowned`.
   - `GET /reports/owner/costs` không đổi.

## 9. Không đổi API, chỉ cần biết

1. Ngựa cần giáo án riêng: HT tạo một lớp riêng, chỉ ghi danh con ngựa đó.
2. Việc trong checklist không có giờ phải làm, chỉ cần xong trong ngày.
3. Ảnh khi báo sự cố là tùy chọn, tối đa một ảnh.
