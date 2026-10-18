# Thay đổi API cần FE cập nhật (đợt sửa theo góp ý demo)

Cập nhật: 2026-10-18

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

1. `POST /horses`: `ownerId` (UUID tài khoản HORSE_OWNER đang hoạt động) và `microchipId` (đúng 15 chữ số) giờ **bắt buộc**. Thiếu, `null` hoặc sai định dạng: 400 gắn đúng ô. `PATCH /horses/:horseId` không cho xóa số chip: gửi `microchipId` là `null` hoặc chuỗi rỗng trả 400 ở ô đó (không gửi trường thì giữ nguyên, đổi sang số khác vẫn được).
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

## Lịch chăm sóc y tế: giao theo vai trò

1. `POST /horses/:horseId/care-schedules` và `PATCH /care-schedules/:id` có thêm `assigneeType` (`GROOM` | `VET`), đi kèm `assignedTo`:

   | `assigneeType` | `assignedTo` | Nghĩa |
   |---|---|---|
   | bỏ trống / `null` | bỏ trống | Chưa giao ai |
   | `GROOM` | bỏ trống | Groom đang phụ trách ngựa; đổi Groom thì lịch tự theo Groom mới |
   | `GROOM` | UUID Groom | Đúng Groom đó, kể cả Groom không phụ trách ngựa |
   | `VET` | UUID bác sĩ (bắt buộc) | Đúng bác sĩ đó |

   - Gửi `assignedTo` mà không có `assigneeType`, hoặc `VET` không kèm người: 400 ô `assignedTo`. Người không đúng vai trò hoặc không hoạt động: 400.
   - Sửa lịch: muốn đổi cách giao thì gửi `assigneeType` (kèm `assignedTo` nếu chọn người).
2. Response lịch chăm sóc có thêm `assigneeType`. `assignedTo = null` kèm `assigneeType = GROOM` nghĩa là "Groom phụ trách".
3. `GET /grooms/me/today` (màn Hôm nay của Groom) có thêm `otherCareSchedules`: lịch giao đích danh cho Groom ở ngựa Groom không phụ trách, mỗi dòng có `horseId`, `horseName`. `careSchedules` trong từng ngựa giờ gồm cả lịch giao "Groom phụ trách".
4. `assignedTo` trong khối lịch chăm sóc của `GET /medical/dashboard` là người làm hiện tại (đã tra Groom phụ trách), `null` nếu chưa có ai.
5. Khóa tài khoản hoặc đổi vai trò người còn lịch chưa làm được giao đích danh: 409 `Người này còn N lịch chăm sóc được giao đích danh chưa làm, cần nhờ bác sĩ giao lại trước khi khóa tài khoản`.

## Checklist hằng ngày: tự thử lại và nút sinh lại

1. Route mới `POST /daily-checklists/regenerate-today`, chỉ Club Manager, không có body. Sinh checklist hôm nay cho các ngựa có Groom mà còn thiếu; checklist đã có giữ nguyên. Trả 200:

   ```json
   { "date": "2026-10-17", "generated": 1, "failures": [{ "horseId": "…", "horseName": "Gió", "message": "…" }] }
   ```

   - `failures` rỗng là đủ. Vai trò khác: 403.
2. Thông báo mới cho Club Manager, `category` là `DAILY_CHECKLIST`, `resource` là `null`:
   - Lỗi kéo dài (mức `HIGH`), tối đa một lần mỗi ngày: tiêu đề "Lỗi sinh checklist hôm nay", nội dung "Chưa có checklist hôm nay cho Winx, Gió. Hệ thống đang thử lại." FE có thể gắn nút "Sinh lại checklist hôm nay" gọi route ở mục 1.
   - Đã đủ lại (mức `NORMAL`), chỉ khi trước đó đã báo lỗi: tiêu đề "Checklist hôm nay đã đủ", nội dung "Đã có đủ checklist hôm nay."

## Miễn việc chung cho từng ngựa

1. `POST /horses/:horseId/care-tasks` nhận thêm `mode` (`EXTRA` | `EXEMPT`, mặc định `EXTRA` như cũ).
   - `EXEMPT` miễn một loại việc đang "áp mọi ngựa" trong khoảng ngày, ví dụ không tắm 5 ngày vì ngựa sốt. `note` là lý do, bắt buộc: thiếu trả 400 ở ô `note`.
   - Miễn loại việc không áp mọi ngựa: 409.
2. Response việc riêng (`GET /horses/:horseId/care-tasks` và POST ở trên) có thêm `mode`. FE nên hiện dòng `EXEMPT` là "Miễn: <tên việc>".
3. Miễn bắt đầu hôm nay: dòng việc đó biến khỏi checklist hôm nay nếu chưa tick. Gỡ dòng miễn (`DELETE /horse-care-tasks/:id`): việc có lại ngay trong checklist hôm nay, Groom nhận thông báo "Có việc mới hôm nay".
4. `PATCH /care-task-types/:id` đổi `appliesToAll` khi còn ngựa được gắn thêm hoặc được miễn loại đó chưa hết hạn: 409.

## Ai được báo sự cố

1. `POST /incidents`: mọi Groom đang hoạt động báo được cho ngựa đang ở CLB, không cần đang phụ trách con đó. Trước đây Groom không phụ trách nhận 403. FE bỏ giới hạn "chỉ chọn ngựa mình phụ trách" ở màn báo sự cố.
2. Ngựa đã chuyển nhượng hoặc đã mất vẫn trả 409, kể cả với Groom cũ của ngựa (trước đây Groom cũ nhận 403).
3. Groom báo hộ: Groom đang phụ trách ngựa nhận thông báo "Sự cố tại chuồng" như Head Trainer của khu. Groom báo hộ xem được sự cố mình báo; Groom đang phụ trách ngựa xem được mọi sự cố của ngựa đó (`GET /incidents`, `GET /incidents/:id`), ngựa chuyển cho Groom khác thì Groom cũ chỉ còn thấy sự cố mình báo.
4. HT, CM, bác sĩ vẫn không gọi được route này (403); họ gửi yêu cầu khám qua `POST /horses/:horseId/exam-requests`.

## Hủy lần xuất kho ghi nhầm

1. Route mới `POST /supplies/usages/:usageId/cancel`, body `{ "reason": "Ghi nhầm số lượng" }` (bắt buộc, tối đa 500 ký tự). Trả 200 kèm vật tư sau khi cộng trả tồn.
   - Người xuất tự hủy trong 24 giờ, CM hủy bất kỳ lúc nào; còn lại 403. Lần xuất đã hủy: 409. Mã không có: 404.
2. `GET /supplies/items/:id/movements` mỗi dòng có thêm:
   - `usageId`: mã lần xuất, chung cho các dòng `USAGE` của một lần xuất (trừ nhiều lô) và dòng `USAGE_REVERSAL` hủy nó. Dòng xuất cũ có `usageId = null`, không hủy được.
   - `cancelled`: `true` ở dòng `USAGE` của lần xuất đã hủy. FE gạch dòng đó và ẩn nút hủy.
   - Loại dòng mới `type = USAGE_REVERSAL` (số dương, ghi chú là lý do hủy).
3. Nút "Hủy lần xuất" nên hiện ở dòng `USAGE` có `usageId`, chưa `cancelled`, và (với người không phải CM) do chính người dùng xuất trong 24 giờ.
4. `GET /reports/club/finance`: "đã dùng" không còn tính lần xuất đã hủy, kể cả ở tháng đã xem trước đó.

## Thông báo mới cho Groom và người gửi yêu cầu khám

Không đổi API. Chỉ thêm người nhận và loại tin; FE hiện như các thông báo đang có (inbox, socket, push).

1. Groom đang phụ trách ngựa nhận thêm (cùng nội dung với HT và chủ):
   - Đặt khóa huấn luyện (HIGH) và gỡ khóa (NORMAL), `category = TRAINING_LOCK`.
   - Đổi trạng thái sức khỏe, mọi chiều, `category = HEALTH_STATUS`: Chấn thương, Cách ly (HIGH); Cần theo dõi, về Đủ điều kiện (NORMAL).
2. Người gửi yêu cầu khám (Groom qua sự cố, HT, CM) nhận kết quả, `category = EXAM_REQUEST`, mức NORMAL, `resource` là ngựa:
   - Khám xong: "Ngựa X đã được bác sĩ khám".
   - Bỏ qua: "Yêu cầu khám ngựa X được bỏ qua", nội dung kèm lý do.
   - Yêu cầu do hệ thống tự sinh (cảnh báo sốt, sụt cân) hoặc do chính bác sĩ xử lý gửi thì không có thông báo này.
3. Ca Khẩn vẫn chỉ báo một lần, không nhắc lại.

## Bảng điều khiển y tế: lọc "Lịch của tôi"

1. `GET /medical/dashboard` nhận thêm `careAssignee=me` (tùy chọn): khối `careSchedules` chỉ còn lịch có người làm hiện tại là người gọi. Các khối khác không đổi. Không gửi thì như cũ.
2. Mỗi dòng `careSchedules` có thêm `assignedToName`: họ tên người làm hiện tại, `null` nếu chưa có ai.
3. Nhắc lịch chăm sóc không đổi: thông báo đẩy đúng ngày đến hạn một lần. Lịch sắp tới và quá hạn xem trên dashboard và màn Hôm nay của Groom.

## Báo Groom khi buổi tập bị hủy

Không đổi API.

1. HT hủy một buổi tập (`POST /training-sessions/:sessionId/cancel`): người dắt từng lượt vừa bị hủy nhận thông báo `category = TRAINING_SESSION` (loại mới), mức HIGH, `resource = null`.
   - Mỗi Groom một tin liệt kê ngựa của mình, ví dụ "Buổi tập Sức bền sáng lúc 06:00 ngày 21/11/2026 đã hủy: Mưa lớn. Không dắt Winx, Gió ra sân."
   - Lượt chưa có người dắt thì Groom đang phụ trách ngựa nhận.
2. Hủy cả lớp không gửi thông báo này.
3. FE cần thêm biểu tượng cho `category = TRAINING_SESSION`.


## Dừng sớm lượt tập

1. Trạng thái lượt tập mới `STOPPED` (dừng sớm), là trạng thái kết thúc như `COMPLETED`: không điểm danh, bắt đầu, giao Groom lại; vẫn ghi kết quả chạy thử và đánh giá được.
2. Route mới `POST /session-participants/:id/stop` (HT), body `{ "reason": "Ngựa đi khập khiễng" }`:
   - Lý do bắt buộc, 1–500 ký tự sau khi cắt khoảng trắng; trống thì 400.
   - Chỉ lượt `ONGOING` của buổi `IN_PROGRESS`, không thì 409. Quyền như `/complete`.
   - Response như `/complete`: `status = STOPPED`, `completedAt` là giờ dừng. Lượt cuối còn mở dừng thì buổi tự đóng `COMPLETED`.
3. Field mới `stoppedReason` (null nếu không dừng sớm) ở:
   - Response các route `/session-participants/:id/*` và `GET /training-sessions/:sessionId/participants`.
   - `GET /horses/:horseId/training/sessions` (lượt dừng sớm nằm ở `when=history`).
   - `GET /grooms/me/today` → `trainingRuns[]` (lượt dừng sớm vẫn hiện).
4. Đếm riêng lượt dừng sớm:
   - `GET /horses/:id/workload`: thêm `sessionsStopped`. `sessionsCompleted`, `byIntensity`, `plannedDistanceM` chỉ tính lượt hoàn thành; `actualDurationSeconds`, `actualDistanceM` cộng cả lượt dừng sớm.
   - Báo cáo tiến độ ngựa (`GET /reports/horses/:horseId/progress`): thêm `totals.stopped` và `weekly[].stopped`; `trainedMinutes` cộng cả lượt dừng sớm, `completed` và `plannedDistanceM` thì không.
   - Dashboard báo cáo (`GET /reports/dashboard`): thêm `training.stopped` và `weekly[].stopped`.
5. FE cần thêm nhãn và màu cho `STOPPED` ở mọi chỗ hiển thị trạng thái lượt.

## Bỏ ngưỡng nhịp tim/tốc độ riêng từng ngựa

1. Bỏ route `PUT /horses/:id/thresholds` (gọi vào giờ trả 404). Không ai đặt ngưỡng riêng cho ngựa nữa; FE bỏ màn/nút đặt ngưỡng.
2. `GET /horses/:id/thresholds` giữ nguyên quyền (HT của khu, CM, VET) nhưng đổi response: mọi ngựa dùng chung một bộ ngưỡng CLB.

   ```json
   {
     "horseId": "uuid",
     "limits": { "heartRateWarningBpm": 220, "heartRateCriticalBpm": 240, "maxSpeedMps": 18 }
   }
   ```

   Bỏ `source`, `profiles`; `activeLimits` đổi tên thành `limits`.
3. Nhật ký thao tác: bỏ giá trị `feature = PERF_THRESHOLD` và `entityType = PERFORMANCE_THRESHOLD`. FE xóa hai giá trị này khỏi bộ lọc và bảng nhãn.

## Sửa kết quả chạy thử và đánh giá sau buổi

1. Hạn sửa chung: HT sửa được tới 7 ngày sau giờ kết thúc dự kiến của buổi; buổi đã hủy hoặc quá hạn thì 409. Lượt `COMPLETED` và `STOPPED` sửa như nhau. Không báo chủ ngựa.
2. `PATCH /session-participants/:id/trial-results/:attemptNo` (HT của lớp) nhận thêm `elapsedMs`, `notes`, `reason`; mọi field đều tùy chọn, bỏ trống là giữ nguyên:

   ```json
   { "elapsedMs": 75000, "notes": "Bấm lại theo video", "reason": "Bấm giờ nhầm" }
   ```

   - Body cũ `{ "videoMediaId": "uuid" }` hoặc `{ "videoMediaId": null }` chạy như trước, không cần `reason`.
   - Gửi `elapsedMs` (1–3.600.000) hoặc `notes` (null để xóa) thì bắt buộc `reason` 1–500 ký tự sau khi cắt khoảng trắng; thiếu hoặc trống là 400.
   - Body `{}` trước đây là 400, giờ trả 200 và không đổi gì.
   - Không sửa `attemptNo`, không xóa lần chạy.
   - Schema request đổi tên `UpdateTrialResultVideoDto` → `UpdateTrialResultDto`.
3. Route mới `PATCH /session-participants/:id/evaluation` (HT phụ trách lớp, ngựa thuộc khu mình), response như `GET`:

   ```json
   { "score": 8, "comment": null, "reason": "Chấm nhầm" }
   ```

   - `reason` bắt buộc 1–500 ký tự; `score` 1–10 và `comment` (null để xóa) tùy chọn. Lượt chưa có đánh giá là 404.
4. Câu báo 409 của PATCH video đổi chung cho cả 3 thao tác: "Quá hạn sửa kết quả buổi tập" (trước là "Quá hạn gắn video chạy thử"), "Buổi tập đã hủy, không sửa kết quả được" (trước là "Buổi tập đã hủy, không sửa video chạy thử").
5. Báo cáo tiến độ ngựa (`bestTrialMs`, `evaluation`) tự lấy giá trị mới sau khi sửa. Nhật ký thao tác ghi giá trị trước, sau và `reason` (`feature = TIME_TRIAL` / `PERF_EVAL`, `action = UPDATE`).
