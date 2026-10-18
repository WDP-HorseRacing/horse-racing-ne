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
4. `PATCH /horses/:horseId/lifecycle-status` gửi đúng trạng thái hiện tại (kể cả ghi nhận mất lần nữa): 409 `Ngựa <tên> đã ở trạng thái <trạng thái>` (trước trả 200, không ghi gì). Xem trước trả `blockedReason` cùng câu này.

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


## Tiêm phòng, tẩy giun chỉ giao bác sĩ

1. `POST /horses/:horseId/care-schedules` và `PATCH /care-schedules/:id` (khi đổi cách giao): lịch loại Tiêm phòng hoặc Tẩy giun giao cho Groom (`assigneeType: GROOM`) trả 400 ở ô `assigneeType`: "Tiêm phòng, tẩy giun chỉ giao được cho bác sĩ". Chỉ giao bác sĩ (`VET`) hoặc để chưa giao ai. Kiểm tra móng vẫn giao Groom hoặc bác sĩ như cũ.
2. Sửa lịch mà không đổi cách giao (dời ngày, ghi chú) không bị kiểm luật này.

## Xuất kho thuốc và ghi chú lần xuất

1. `POST /supplies/items/:id/usages` với vật tư loại thuốc (`MEDICINE`): chỉ VET và CM xuất được; HT, GROOM nhận 403 "Chỉ Veterinarian hoặc Club Manager được xuất thuốc". FE ẩn nút xuất ở vật tư loại thuốc với HT, GROOM.
2. Mọi lần xuất (mọi loại vật tư) bắt buộc `note` (tối đa 500 ký tự). Thiếu hoặc toàn khoảng trắng: 400 ở ô `note` "Phải ghi chú lần xuất".

## Bảng điều khiển y tế: khối Thuốc cần cho hôm nay

1. `GET /medical/dashboard` có thêm `todayPrescriptions`: các đơn thuốc đang hiệu lực hôm nay theo ngày lịch CLB, xếp theo tên ngựa rồi tên thuốc. Mỗi dòng `{ prescriptionId, horseId, horseName, medicine, dosage, frequency, startDate, endDate (null nếu dùng tới khi đóng bệnh án), medicalRecordId, caseId (null nếu buổi khám ngoài bệnh án) }`.
2. Bộ lọc khu (`barnId`, `mine`) áp cho khối này; đơn của buổi khám đã hủy không hiện.

## Đơn thuốc của buổi khám không mở bệnh án phải có ngày kết thúc

1. `POST /horses/:horseId/medical-records` mà buổi khám không mở bệnh án: mọi dòng `prescriptions` bắt buộc có `endDate`. Thiếu: 400 "Đơn thuốc của buổi khám không mở bệnh án phải có ngày kết thúc". Buổi khám mở bệnh án và tái khám (`POST /medical-cases/:caseId/visits`) vẫn được để trống `endDate` (dùng tới khi đóng bệnh án).

## Thông báo đến hạn khám định kỳ

1. Thông báo mới cho mọi VET khi ngựa đến hạn khám định kỳ mà chưa có ngày hẹn khám: tiêu đề "Ngựa {tên} đến hạn khám định kỳ", nội dung "{tên} đến hạn khám định kỳ ngày dd/mm/yyyy. Vui lòng đặt lịch khám.". Loại `CARE_REMINDER`, mức `NORMAL`, gắn với ngựa (bấm vào mở hồ sơ ngựa). Mỗi hạn khám chỉ báo một lần.
2. Các nhắc lịch y tế chạy lúc 05:00 sáng mỗi ngày (trước là 07:00).

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

## Groom biết đúng việc, đúng giờ, đúng chỗ

1. `GET /grooms/me/today`: mỗi lượt trong `horses[].trainingRuns` có thêm `location`, `surface` (chuỗi hoặc null) của buổi.
2. Thêm mảng `assistedRuns`: lượt hôm nay Groom được giao dắt ở ngựa Groom không phụ trách, theo giờ bắt đầu, cùng field với `trainingRuns` kèm `horseId`, `horseName`. Groom không phụ trách ngựa nào vẫn có mảng này.

   ```json
   {
     "date": "2026-10-18",
     "horses": [],
     "otherCareSchedules": [],
     "assistedRuns": [
       {
         "participantId": "uuid", "sessionId": "uuid", "sessionName": "Sức bền sáng",
         "scheduledStartAt": "2026-10-17T23:00:00.000Z", "scheduledEndAt": "2026-10-18T00:00:00.000Z",
         "location": "Sân 1", "surface": "Cát", "status": "PLANNED", "stoppedReason": null,
         "horseId": "uuid", "horseName": "Sấm"
       }
     ]
   }
   ```

3. 409 mới khi `PATCH /session-participants/:id/groom`: "Groom đang dắt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày 19/10/2026, trùng giờ với lượt này".
4. 409 mới khi `PUT /horses/:id/groom` và `PUT /horses/:id/placement`: "Groom mới đang dắt lượt trùng giờ: buổi "Sáng" lúc 06:00 ngày 19/10/2026 trùng lượt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày 19/10/2026. Giao lại người dắt các lượt này trước khi đổi Groom" (nhiều cặp nối bằng "; "). Không lưu gì; FE hiện câu báo để HT giao lại người dắt trước.
5. 409 mới khi thêm buổi (`POST /classes/:classId/sessions`, `.../sessions/bulk`), sửa buổi (`PATCH /training-sessions/:sessionId`) và ghi danh (`POST /classes/:classId/enrollments`) nếu người dắt của một lượt bị trùng giờ: "Người dắt bị trùng giờ: ngựa Gió ở buổi "Buổi mới" lúc 08:30 ngày 10/01/2030 trùng lượt ngựa Sấm ở buổi "Buổi" lúc 08:00 ngày 10/01/2030. Giao lại người dắt các lượt này trước". Không lưu gì. Thêm nhiều buổi thì câu báo có tiền tố "Buổi {n}: " như các lỗi khác.
6. Sửa buổi giờ giữ nguyên người dắt HT đã giao tay (trước đây bị gắn lại Groom phụ trách).
7. Thông báo mới cho Groom khi HT giao dắt một lượt: `category = TRAINING_SESSION`, mức `NORMAL`, `resource = null`, ví dụ "Bạn được giao dắt Gió ở buổi tập Sáng lúc 06:00 ngày 19/10/2026, tại Sân 1, mặt sân Cát.". Gỡ người dắt không có thông báo.


## Ngựa Chấn thương/Cách ly chưa có bệnh án và thông báo Cách ly

1. `GET /medical/dashboard` có thêm mảng `horsesWithoutCase`: ngựa đang `INJURED` hoặc `QUARANTINED` mà không có bệnh án đang mở. Cùng bộ lọc `barnId`, `healthStatus` và phạm vi HT như các khối khác; không có ngựa đã chuyển nhượng, đã mất, hồ sơ đã xóa. Xếp Cách ly trước, rồi con chuyển trạng thái lâu nhất trước.

   ```json
   {
     "horsesWithoutCase": [
       {
         "horseId": "uuid", "horseName": "Gió",
         "barnId": "uuid", "barnName": "Khu A",
         "stallId": "uuid", "stallCode": "A-01",
         "healthStatus": "QUARANTINED",
         "since": "2026-10-15T02:00:00.000Z"
       }
     ]
   }
   ```

   `since` là lúc chuyển sang trạng thái hiện tại, `null` nếu nhật ký không có.
2. Gợi ý: mỗi dòng có nút "Lập phiếu khám" (mở form `POST /horses/:horseId/medical-records` cho ngựa đó; kết luận Có vấn đề sẽ mở bệnh án) và nút đổi trạng thái sức khỏe (`PATCH /horses/:horseId/health-status`) khi đặt nhầm hoặc đã ổn.
3. Thông báo Cách ly (`category = HEALTH_STATUS`, mức `HIGH`) gửi HT, CM, Groom có thêm câu cuối liệt kê ngựa có thể đã tiếp xúc, tối đa 10 tên, ví dụ: "... Ngựa không được tập và không được đua. Ngựa có thể đã tiếp xúc: Mây (cùng khu), Sương (cùng khu, cùng Groom), Lúa (cùng Groom) và 2 con khác.". Thông báo của chủ ngựa giữ nội dung cũ. Không có ngựa tiếp xúc thì mọi người nhận nội dung cũ. API `PATCH health-status` không đổi.

## Bác sĩ gắn, miễn, gỡ việc riêng của ngựa

1. VET được gọi thêm các route việc riêng, cho mọi ngựa trong CLB (không giới hạn khu, kể cả ngựa chưa xếp khu). Body, response, mã lỗi không đổi:
   - `GET /horses/:horseId/care-tasks`: CM, HT (khu mình), VET, GROOM (ngựa mình phụ trách).
   - `POST /horses/:horseId/care-tasks`, `DELETE /horse-care-tasks/:id`: HT (khu mình), VET.
2. HT giữ nguyên phạm vi khu. Khẩu phần (`feeding-plans`) không đổi, vẫn chỉ HT.
3. Bác sĩ đổi thì HT của khu nhận thông báo `category = DAILY_CHECKLIST`, mức `NORMAL`, tiêu đề "Bác sĩ đổi việc riêng của ngựa", ví dụ: `Bác sĩ Lan miễn việc "Tắm rửa" (từ 18/10/2026 đến 20/10/2026) cho ngựa Gió. Lý do: Đang sốt, kiêng tắm.`. Kiểu: "gắn thêm việc", "miễn việc", "gỡ việc gắn thêm", "gỡ miễn việc". HT tự làm thì không có thông báo này.

## Chi phí y tế theo từng buổi khám

1. Buổi khám có thêm `cost` (VND, số nguyên ≥ 0, tối đa 10 tỷ), tùy chọn, bỏ trống là 0:
   - Body `POST /horses/:horseId/medical-records` (khám định kỳ, theo yêu cầu) và `POST /medical-cases/:caseId/visits` (tái khám) nhận `cost`.
   - Response buổi khám (`GET /horses/:horseId/medical-records`, `GET /medical-records/:id`, `visits` trong `GET /medical-cases/:caseId`, response ghi/hủy buổi khám) có `cost` và `costHidden`.
   - HT: không có key `cost`, `costHidden`.
   - OWNER: buổi khám thuộc giai đoạn chủ khác sở hữu có `cost = null`, `costHidden = true` (gợi ý hiện "Chi phí thuộc chủ khác"). Buổi của mình hiện số ngay, không chờ bệnh án đóng.
2. Đóng bệnh án `POST /medical-cases/:caseId/close` **bỏ** `totalCost` trong body (gửi lên là 400). Biểu mẫu đóng không còn ô chi phí.
3. Bệnh án:
   - `totalCost` của bệnh án = tổng `cost` các buổi khám chưa hủy, có cả khi bệnh án đang điều trị (không còn `null`). OWNER chỉ được cộng phần của mình.
   - **Bỏ** `costHidden` ở cấp bệnh án; dùng `costHidden` của từng buổi.
   - `totalCost` của `GET /horses/:horseId/medical-cases` = tổng mọi buổi khám chưa hủy của ngựa, trong và ngoài bệnh án.
4. **Bỏ** `PATCH /medical-cases/:caseId/cost`. **Thay bằng** `PATCH /medical-records/:id/cost` (chỉ VET):

   ```json
   { "cost": 1500000, "reason": "Gõ thừa số 0" }
   ```

   - Trả buổi khám (như `GET /medical-records/:id`). Bệnh án đang mở hay đã đóng đều sửa được, không giới hạn thời gian.
   - Số trùng số cũ: 200, không ghi nhật ký, không báo ai.
   - Buổi khám đã hủy, ngựa đã chuyển nhượng hoặc đã mất: 409. Không có buổi khám: 404.
   - Thông báo `category = MEDICAL_CASE`, mức `NORMAL`, tiêu đề "Điều chỉnh chi phí khám ngựa X", ví dụ: "Chi phí buổi khám ngày 20/05/2026 của ngựa Gió được điều chỉnh từ 15.000.000 đ thành 1.500.000 đ.". Gửi CM và chủ của giai đoạn chứa ngày khám. `resource` là bệnh án; buổi khám ngoài bệnh án thì `resource.type = HORSE`.
5. Thông báo đóng bệnh án: CM nhận "Tổng chi phí điều trị: …" (cả bệnh án), chủ nhận "Chi phí điều trị của bạn: …" (phần thuộc giai đoạn mình sở hữu).
6. Báo cáo:
   - `GET /medical/cost-report` lọc theo **ngày khám** (không còn theo ngày đóng), gồm cả buổi khám ngoài bệnh án. Đổi `caseCount` thành `visitCount` (số buổi khám chưa hủy) ở tổng và từng dòng. `ownerId` lọc theo chủ của giai đoạn chứa ngày khám; `barnId` vẫn theo khu hiện tại.
   - `GET /reports/owner/costs`, `GET /reports/club/finance`: `medicalCost` tính theo ngày khám; từng ngựa đổi `caseCount` thành `visitCount`.
7. Chuyển chủ nội bộ `POST /horses/:horseId/ownership-transfers` không còn 409 khi ngựa đang có bệnh án mở. Bán ra ngoài và ghi nhận mất khi còn bệnh án mở vẫn 409 như cũ.

## Hủy buổi khám: chỉ bác sĩ ghi phiếu

1. `POST /medical-records/:id/void`: bác sĩ hủy buổi khám do bác sĩ khác ghi nhận 403 "Chỉ bác sĩ ghi phiếu khám mới được hủy phiếu này". `PATCH /medical-records/:id/cost` không đổi.

## Head Trainer không có hai buổi trùng giờ ở hai lớp

1. 409 mới khi thêm buổi (`POST /classes/:classId/sessions`, `.../sessions/bulk`) và đổi giờ buổi (`PATCH /training-sessions/:sessionId`) nếu HT của lớp đã có buổi chưa hủy trùng giờ ở lớp khác của mình: "Trùng giờ với lịch của Huấn luyện viên trưởng: lớp KD-02, 06:00 ngày 10/10/2026". Không lưu gì. Thêm nhiều buổi thì câu báo có tiền tố "Buổi {n}: " như các lỗi khác.
2. 409 mới khi `POST /users/:id/head-trainer-handover` nếu buổi của lớp được chuyển trùng giờ với buổi ở lớp của HT nhận: "Huấn luyện viên trưởng nhận có buổi trùng giờ: lớp KD-01 lúc 06:00 ngày 10/10/2026 trùng lớp KD-05 lúc 06:30 ngày 10/10/2026. Đổi giờ các buổi này trước khi bàn giao" (nhiều cặp nối bằng "; "). Không chuyển gì.

## Chấn thương theo từng vết, theo dõi qua các buổi khám

Mỗi vết chấn thương nay có mã riêng (`injuryId`) và sống qua nhiều buổi khám. Vị trí, vùng, loại cố định lúc phát hiện; mỗi buổi khám chỉ ghi mức hồi phục mới. Dữ liệu cũ đã được gom thành vết theo (ngựa, bệnh án, vùng, loại).

1. Body buổi khám (`POST /horses/:horseId/medical-records`, `POST /medical-cases/:caseId/visits`): bỏ `injuries`, thay bằng hai danh sách (mỗi danh sách tối đa 20 dòng):

   ```json
   {
     "injuryUpdates": [
       { "injuryId": "uuid", "recoveryStatus": "RECOVERING", "notes": "Bớt sưng" }
     ],
     "newInjuries": [
       { "bodyRegion": "LEFT_FRONT_LEG", "injuryType": "SPRAIN", "position": { "x": 0.1, "y": 0.2, "z": 0 }, "recoveryStatus": "ACUTE", "notes": "Cổ chân" }
     ]
   }
   ```

   - Vết không gửi trong buổi khám giữ nguyên mức cũ.
   - Hai vết mới cùng vùng và cùng loại nay ghi được (trước đây 400).
   - Lỗi mới:
     - 400 "Mỗi chấn thương chỉ cập nhật một lần trong một buổi khám".
     - 400 "Chấn thương không thuộc con ngựa này": mã của ngựa khác, hoặc vết đã bị ẩn.
     - 409 "Chấn thương đã lành, không cập nhật được; tái phát thì ghi chấn thương mới".
   - Như cũ: chỉ buổi khám thuộc bệnh án hoặc buổi kết luận Có vấn đề mới gửi được hai danh sách này. Buổi khám ngoài bệnh án kết luận Bình thường gửi thì nhận 400.
2. Response buổi khám (`injuries[]`): mỗi dòng có thêm `injuryId`. Các trường còn lại giữ nguyên: `bodyRegion`, `injuryType`, `position` lấy từ vết; `recoveryStatus`, `notes` là của buổi khám đó.
3. `GET /horses/:horseId/injuries` đổi shape. Trước đây là danh sách phẳng từng dòng; nay mỗi phần tử là một vết, xếp theo lần khám sớm nhất của vết. Query mới `unhealedOnly=true` chỉ lấy vết chưa lành.

   ```json
   [
     {
       "id": "uuid", "horseId": "uuid",
       "bodyRegion": "LEFT_FRONT_LEG", "injuryType": "SPRAIN", "position": { "x": 0.1, "y": 0.2, "z": 0 },
       "firstMedicalRecordId": "uuid", "firstExamDate": "2026-10-10T02:00:00.000Z",
       "currentRecoveryStatus": "RECOVERING",
       "history": [
         { "medicalRecordId": "uuid", "examDate": "2026-10-10T02:00:00.000Z", "caseId": "uuid", "recoveryStatus": "ACUTE", "notes": "Cổ chân" },
         { "medicalRecordId": "uuid", "examDate": "2026-10-14T02:00:00.000Z", "caseId": "uuid", "recoveryStatus": "RECOVERING", "notes": "Bớt sưng" }
       ]
     }
   ]
   ```

   - `currentRecoveryStatus` là mức ở lần khám mới nhất chưa hủy. `history` tăng dần theo ngày khám, chỉ gồm buổi chưa hủy.
   - Hủy buổi khám: mức của các vết buổi đó đã cập nhật quay về mức trước. Vết không còn buổi khám chưa hủy nào (vd vết do chính buổi bị hủy phát hiện) biến mất khỏi danh sách.
4. Luồng form khám gợi ý:
   1. Mở form: gọi `GET /horses/:horseId/injuries?unhealedOnly=true`, hiện các vết đang theo dõi trên mô hình 3D.
   2. Với từng vết: chọn mức hồi phục mới (đưa vào `injuryUpdates`), hoặc bỏ qua nếu buổi này không khám chỗ đó.
   3. Vết mới: chạm vào mô hình để lấy `position`, chọn vùng, loại, mức (đưa vào `newInjuries`).
5. Màn hình 3D gợi ý:
   - Mặc định gọi `unhealedOnly=true`, tô màu điểm theo `currentRecoveryStatus`.
   - Có nút xem cả vết đã lành (bỏ query).
   - Bấm một điểm thì hiện `history` của vết đó.
6. Đóng bệnh án (`POST /medical-cases/:caseId/close`): 409 mới "Còn chấn thương chưa lành, hãy ghi buổi khám đánh dấu đã lành trước khi đóng bệnh án". Đóng kèm `dateOfDeath` thì không bị chặn. `GET /medical-cases/:caseId/close-preview` có thêm `unhealedInjuryCount` (số vết chưa lành); lớn hơn 0 thì FE báo trước và gợi ý ghi buổi tái khám đánh dấu Đã lành, danh sách vết lấy từ `GET /horses/:horseId/injuries?unhealedOnly=true`.

## Head Trainer xem mọi khu chuồng

1. `GET /barns` và `GET /medical/dashboard` giờ trả mọi khu cho HT (trước đây chỉ khu HT phụ trách).
2. Cả hai nhận thêm query `mine=true` (tùy chọn, mọi vai trò): chỉ các khu người gọi phụ trách. Dùng cho bộ lọc "Khu của tôi".
3. `GET /medical/dashboard?barnId=...` chọn khu không do HT phụ trách không còn 403, trả dữ liệu khu đó. Gửi cùng `mine=true` thì lấy phần giao: khu không do người gọi phụ trách thì đàn rỗng.
