# Thay đổi API cần FE cập nhật (đợt bổ sung requirement)

Cập nhật: 2026-10-14

Mọi path dưới đây có tiền tố `/api/v1`. Vai trò viết tắt: CM = Club Manager, HT = Head Trainer, VET = bác sĩ thú y, GROOM = người chăm ngựa, OWNER = chủ ngựa. Lỗi vẫn theo format chung hiện tại.

## 1. Nhật ký thao tác (audit)

1. **Route mới chạy thật** (trước đây trả 501), chỉ CM:
   - `GET /audit-logs`: danh sách, mới nhất trước. Query đều tùy chọn: `page`, `limit`, `actorId`, `action`, `entityType`, `entityId`, `from`, `to` (`YYYY-MM-DD`, theo lịch CLB, lấy trọn ngày). `from` sau `to`: 400.
   - `GET /audit-logs/:id`: chi tiết một dòng, thêm `before`, `after` (object hoặc `null`). Không có: 404.

   ```json
   {
     "items": [
       {
         "id": "uuid",
         "createdAt": "2026-01-01T03:00:00.000Z",
         "actor": { "id": "uuid", "fullName": "Nguyễn A", "role": "CLUB_MANAGER" },
         "action": "UPDATE",
         "entityType": "SUPPLY_ITEM",
         "entityId": "uuid",
         "reason": null,
         "feature": "SUPPLY_ITEM"
       }
     ],
     "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
   }
   ```

   - `actor` là `null` khi thao tác do hệ thống tự làm.
   - `action`: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `RESTORE`.
   - `entityType` có thêm: `TRAINING_SUBJECT`, `TRAINING_CLASS`, `CLASS_ENROLLMENT`, `SESSION_PARTICIPANT`, `TRIAL_RESULT`, `CARE_TASK_TYPE`, `HORSE_CARE_TASK`, `CHECKLIST_ITEM`, `DAILY_FEE` (danh sách đầy đủ xem Swagger).

2. **`feature` đổi giá trị**: không còn dạng `F1.2`, `F3.7`..., giờ là tên chức năng. Dữ liệu cũ đã được đổi sang tên mới. Danh sách giá trị:
   - Ngựa: `HORSE_CREATE`, `HORSE_UPDATE`, `HORSE_MEASURE`, `HORSE_BARN`, `HORSE_LIFECYCLE`
   - Chuồng: `BARN`, `STALL_GROOM`
   - Y tế: `MED_CHECKUP`, `MED_VISIT`, `MED_EXAM_REQUEST`, `MED_CASE_OPEN`, `MED_CASE_VISIT`, `MED_HEALTH`, `MED_TRAIN_LOCK`, `MED_CASE_CLOSE`, `MED_CARE`
   - Tài khoản: `USER_ACCOUNT`, `HT_HANDOVER`
   - Vật tư: `SUPPLY_ITEM`, `SUPPLY_STOCK`, `SUPPLY_REQUEST`
   - Huấn luyện: `TRAIN_SUBJECT`, `TRAIN_PLAN`, `TRAIN_CLASS`, `TRAIN_ENROLL`, `TRAIN_SESSION`, `TRAIN_RUN`, `TIME_TRIAL`
   - Chăm sóc chuồng: `CARE_TASK`, `FEEDING_PLAN`, `INCIDENT`, `CHECKLIST`
   - Khác: `PERF_EVAL`, `PERF_THRESHOLD`, `DAILY_FEE`

   Nếu FE đang map `F3.x` sang nhãn hiển thị thì đổi sang map theo tên ở trên.

## 2. Y tế

1. `GET /horses/:horseId/health-history`: field `feature` của từng dòng đổi từ `F3.3`, `F3.6`, `F3.7`, `F1.8` sang `MED_VISIT`, `MED_CASE_VISIT`, `MED_HEALTH`, `HORSE_LIFECYCLE` (cùng bộ giá trị ở mục 1.2). Vẫn có thể `null`.
2. `GET /medical/dashboard`: mỗi ngựa trong danh sách đàn có thêm `barnName` (`string | null`), đi cùng `barnId` đã có.

## 3. Vật tư (kho quản lý theo lô)

1. **Bỏ route** `POST /supplies/items/:id/stock-counts` (kiểm kê). Không còn kiểm kê.
2. **Route mới** `POST /supplies/items/:id/receipts` (chỉ CM): nhập hàng trực tiếp, không cần đề xuất. Trả 201 kèm vật tư sau khi nhập.

   ```json
   { "quantity": 10, "unitPrice": 20000, "note": "Mua bổ sung" }
   ```

   - `quantity` > 0, tối đa 2 chữ số thập phân. `unitPrice` **bắt buộc**, số nguyên VND, ≥ 0. `note` tùy chọn, tối đa 500 ký tự.
3. **Route mới** `POST /supplies/items/:id/usages` (CM, HT, VET, GROOM): ghi lấy hàng ra dùng, trừ tồn ngay, không cần duyệt. Trả 201 kèm vật tư sau khi trừ.

   ```json
   { "quantity": 2, "note": "Dùng cho ô A3" }
   ```

   - Lấy nhiều hơn số tồn: 409 `"Số lượng lấy lớn hơn số tồn"`.
4. **Route mới** `GET /supplies/items/:id/lots` (CM, HT, VET, GROOM): các lô của vật tư, lô nhập sớm nhất trước.

   ```json
   [
     { "id": "uuid", "quantity": 10, "remaining": 4, "unitPrice": 20000, "createdAt": "2026-01-01T03:00:00.000Z" }
   ]
   ```

5. `POST /supplies/items`: thêm field tùy chọn `openingUnitPrice` (số nguyên VND, ≥ 0, bỏ trống là 0), là đơn giá của số tồn ban đầu `quantityOnHand`.
6. `PATCH /supplies/requests/:id/status`: khi `status = FULFILLED` thì **bắt buộc** `unitPrice` (số nguyên VND, ≥ 0); thiếu là 400. `APPROVED`, `REJECTED` không cần.

   ```json
   { "status": "FULFILLED", "unitPrice": 18000 }
   ```

7. Response vật tư (mọi route trả vật tư): **bỏ** `lastCountedAt` và `lastCounter`.
8. `GET /supplies/items/:id/movements`: mỗi dòng có thêm `lotId`, `unitPrice`, `amount` (tiền của dòng = chênh lệch × đơn giá lô, âm là xuất). Cả ba là `null` với dòng ghi trước khi có lô.
9. `type` của dòng sổ có thêm giá trị: `OPENING` (tồn ban đầu), `USAGE` (xuất dùng). `RESTOCK` giờ gồm cả nhập trực tiếp lẫn cấp theo đề xuất. `COUNT_ADJUST` chỉ còn ở dữ liệu cũ.
10. Xuất dùng trừ nhiều lô sẽ sinh nhiều dòng `USAGE` (mỗi lô một dòng).

## 4. Thông báo

1. `category` có thêm giá trị `SUPPLY`. Các trường hợp gửi:
   - Đề xuất bổ sung mới: gửi mọi CM, `priority` `NORMAL`, title `"Đề xuất bổ sung vật tư mới"`.
   - Đề xuất được duyệt / bị từ chối / đã cấp: gửi người gửi đề xuất, `priority` `NORMAL`, title lần lượt `"Đề xuất bổ sung đã được duyệt"`, `"Đề xuất bổ sung bị từ chối"` (message kèm lý do), `"Đề xuất bổ sung đã được cấp"`.
   - Vật tư sắp hết (khi xuất dùng làm tồn xuống tới hoặc dưới ngưỡng): gửi mọi CM, `priority` `HIGH`, title `"Vật tư sắp hết"`. Chỉ báo một lần lúc vượt ngưỡng, các lần xuất sau khi đã dưới ngưỡng không báo lại.
2. Các thông báo `SUPPLY` có `resource: null` (không kèm đối tượng để mở thẳng màn chi tiết).

## 5. Phí nuôi ngựa theo ngày (module mới)

Mức phí chung cho mọi ngựa của CLB, đơn vị VND mỗi con mỗi ngày. Chỉ CM dùng được cả 3 route.

1. `GET /daily-fees`: lịch sử mức phí, ngày hiệu lực mới nhất trước.
2. `POST /daily-fees`: đặt mức phí áp dụng từ một ngày. Trả 201.

   ```json
   { "effectiveFrom": "2026-11-01", "dailyFee": 250000 }
   ```

   Response:

   ```json
   { "id": "uuid", "effectiveFrom": "2026-11-01", "dailyFee": 250000, "createdBy": "uuid", "createdAt": "2026-01-01T03:00:00.000Z" }
   ```

   - `effectiveFrom` trước hôm nay (lịch CLB): 400, lỗi gắn field `effectiveFrom`.
   - Đã có mức phí cùng ngày hiệu lực: 409.
3. `DELETE /daily-fees/:id`: xóa mức chưa có hiệu lực, trả 204. Mức đã hiệu lực (từ hôm nay trở về trước): 409 `"Mức phí đã có hiệu lực, không xóa được"`. Không có: 404.
4. Không có route sửa; muốn đổi thì xóa mức chưa hiệu lực rồi đặt lại, hoặc đặt mức mới với ngày hiệu lực sau.

## 6. Báo cáo

Luật chung cho query `from`, `to` (`YYYY-MM-DD`, lịch CLB, lấy trọn cả hai ngày): bỏ trống `to` là hôm nay; bỏ trống `from` là 30 ngày tính tới `to`; `from` sau `to`: 400.

1. **`GET /reports/dashboard` chạy thật** (trước đây trả 501). Vai trò: CM, HT, VET.
   - Query: `from`, `to`, `barnId` (chỉ một khu), `mine=true` (chỉ các khu người gọi phụ trách). Mặc định toàn CLB.
   - Chỉ tính ngựa đang hoạt động, hồ sơ chưa xóa.

   ```json
   {
     "from": "2026-09-15",
     "to": "2026-10-14",
     "herd": {
       "total": 12,
       "byHealthStatus": { "ELIGIBLE": 9, "UNDER_OBSERVATION": 2, "INJURED": 1, "QUARANTINED": 0 },
       "trainingLocked": 1
     },
     "training": {
       "sessions": 20,
       "completed": 85,
       "absent": 4,
       "ineligible": 3,
       "completedByIntensity": { "LIGHT": 30, "MODERATE": 40, "HEAVY": 15 }
     },
     "weekly": [
       { "weekStart": "2026-09-14", "completed": 18, "avgHeartRateBpm": 142, "avgSpeedMps": 12.345, "alertCount": 2 }
     ],
     "horses": [
       {
         "horseId": "uuid", "horseName": "Xích Thố", "barnId": "uuid", "barnName": "Khu A",
         "healthStatus": "ELIGIBLE", "trainingLocked": false, "completed": 8,
         "avgHeartRateBpm": 140, "maxHeartRateBpm": 205, "avgSpeedMps": 12.1, "maxSpeedMps": 16.8,
         "alertCount": 0, "latestWeightKg": 480.5
       }
     ]
   }
   ```

   - `ineligible` gồm cả lượt bị hủy do khóa huấn luyện.
   - `weekly`: tuần bắt đầu thứ Hai; chỉ có những tuần có lượt hoàn thành hoặc có điểm đo.
   - Nhịp tim làm tròn số nguyên, tốc độ 3 chữ số thập phân; không có điểm đo thì `null`. `latestWeightKg` không có thì `null`.

2. `GET /reports/horses/:horseId/progress` và `GET /reports/horses/:horseId/health` từ 501 thành chạy thật. Vai trò: CM, HT, VET, OWNER; phạm vi giống quyền xem hồ sơ ngựa, ngựa ngoài phạm vi hoặc không có: 404. Query `from`, `to` như trên. Shape:

   `progress`:

   ```json
   {
     "horseId": "uuid", "horseName": "Xích Thố", "from": "2026-09-15", "to": "2026-10-14",
     "totals": {
       "completed": 8, "absent": 1, "ineligible": 0,
       "plannedDistanceM": 12000, "trainedMinutes": 360,
       "completedByIntensity": { "LIGHT": 3, "MODERATE": 4, "HEAVY": 1 }
     },
     "weekly": [ { "weekStart": "2026-09-14", "completed": 2, "avgHeartRateBpm": 140, "avgSpeedMps": 12.1, "alertCount": 0 } ],
     "sessions": [
       {
         "participantId": "uuid", "sessionId": "uuid", "sessionName": "Buổi sáng",
         "scheduledStartAt": "2026-09-15T23:00:00.000Z", "sessionType": "REGULAR", "intensity": "MODERATE",
         "plannedDistanceM": 1500, "status": "COMPLETED",
         "avgHeartRateBpm": 140, "maxHeartRateBpm": 200, "avgSpeedMps": 12.1, "maxSpeedMps": 16.0,
         "alertCount": 0,
         "evaluation": { "score": 8, "comment": "Tốt" },
         "bestTrialMs": 72500
       }
     ]
   }
   ```

   - `weekly` cùng shape với `weekly` của dashboard.
   - `evaluation`, `bestTrialMs` và các số đo là `null` khi chưa có.

   `health`:

   ```json
   {
     "horseId": "uuid", "horseName": "Xích Thố", "from": "2026-09-15", "to": "2026-10-14",
     "currentHealthStatus": "ELIGIBLE",
     "statusChanges": [ { "changedAt": "...", "from": "INJURED", "to": "ELIGIBLE", "reason": "Đã hồi phục" } ],
     "measurements": [ { "type": "WEIGHT", "value": 480.5, "measuredAt": "...", "isAbnormal": false } ],
     "medicalCases": [ { "caseId": "uuid", "status": "CLOSED", "openedAt": "...", "closedAt": "...", "initialDiagnosis": "...", "finalConclusion": "..." } ],
     "injuries": [ { "examDate": "...", "bodyRegion": "...", "injuryType": "...", "recoveryStatus": "..." } ],
     "trainingLocks": [ { "lockId": "uuid", "status": "...", "reason": "...", "lockStart": "...", "lockEnd": null, "releasedAt": null } ]
   }
   ```

   - `medicalCases`: bệnh án mở trong kỳ hoặc còn mở trong một phần của kỳ. `trainingLocks`: lệnh khóa có hiệu lực trong một phần của kỳ.
   - Giá trị enum (`sessionType`, `bodyRegion`, `injuryType`, `recoveryStatus`, `status` của khóa) dùng chung enum đã có trong Swagger.

3. Bỏ hẳn `GET /reports/club/training` và `GET /reports/club/medical` (trước đây trả 501). Hiệu suất huấn luyện CLB dùng `GET /reports/dashboard`; sức khỏe toàn đàn dùng `GET /medical/dashboard`.
4. `GET /reports/club/finance` từ 501 thành chạy thật, chỉ Club Manager. Query `from`, `to`. Shape:

   ```json
   {
     "from": "2026-10-01", "to": "2026-10-12",
     "ownerCharges": { "dailyFee": 1800000, "medicalCost": 3300000, "total": 5100000 },
     "supplies": { "purchased": 150833, "used": 45000 },
     "prizeMoney": 0,
     "owners": [ { "ownerId": "uuid", "ownerName": "An", "dailyFee": 1200000, "medicalCost": 1000000, "total": 2200000 } ]
   }
   ```

   - Tiền là số nguyên VND. `prizeMoney` luôn 0.
5. Route mới `GET /reports/owner/costs`: Club Manager (bắt buộc `ownerId`, thiếu: 400, không có tài khoản: 404) và Horse Owner (luôn xem của chính mình, bỏ qua `ownerId`). Query `from`, `to`, `ownerId`. Shape:

   ```json
   {
     "ownerId": "uuid", "ownerName": "An", "from": "2026-10-01", "to": "2026-10-12",
     "dailyFee": 1200000, "medicalCost": 1000000, "total": 2200000, "prizeMoney": 0,
     "horses": [
       { "horseId": "uuid", "horseName": "Gió", "billedDays": 5, "dailyFee": 700000, "caseCount": 1, "medicalCost": 1000000, "total": 1700000 }
     ]
   }
   ```

   - `billedDays`: số ngày bị tính phí nuôi. Ngày chuyển chủ tính cho chủ mới; ngày ngựa đã chuyển nhượng ra ngoài hoặc đã mất không tính.
   - `horses` gồm mọi ngựa có ít nhất một ngày còn ở CLB dưới tên chủ trong kỳ, kể cả ngựa chưa phát sinh chi phí. Ngựa đã chuyển nhượng ra ngoài hoặc đã mất từ trước kỳ không hiện.

6. Luật tính tiền chung của 2 báo cáo trên (để FE ghi chú trên màn hình nếu cần):
   - Kỳ `from`–`to` theo lịch CLB, lấy trọn cả hai ngày; bỏ trống `to` là hôm nay, bỏ trống `from` là 30 ngày tính tới `to`; `from` sau `to`: 400.
   - Phí nuôi: xét từng ngày trong kỳ, không quá hôm nay. Ngày được tính cho người làm chủ lúc hết ngày (ngày chuyển chủ tính cho chủ mới). Chỉ tính ngày ngựa còn ở CLB (Đang hoạt động hoặc Đã giải nghệ). Ngựa đang bị xóa hồ sơ (hồ sơ tạo nhầm) không tính và không hiện trong báo cáo. Mỗi ngày lấy mức phí đang hiệu lực của ngày đó; ngày trước mức phí đầu tiên không tính.
   - Chi phí y tế: bệnh án đóng trong kỳ, thuộc người làm chủ lúc đóng. Bệnh án đang mở hoặc đã hủy không tính.
   - `club/finance` → `supplies`: `purchased` là giá trị nhập hàng trong kỳ (không gồm tồn ban đầu), `used` là giá trị đã xuất dùng, đều theo đơn giá của lô.
   - `club/finance` → `ownerCharges.medicalCost` gồm cả bệnh án đóng lúc ngựa không có chủ, nên có thể lớn hơn tổng cột y tế của bảng `owners`.
4. Nếu FE sinh client từ OpenAPI: `operationId` của nhóm reports đổi (vd `ReportsController_dashboard` thành `DashboardController_get`, `ReportsController_clubTraining` thành `ClubReportsController_clubTraining`), tên hàm sinh ra sẽ đổi theo.

## 7. Checklist chăm sóc hằng ngày (đổi cách sinh)

API giữ nguyên (path, query, response). Chỉ đổi thời điểm checklist xuất hiện:

1. Trước đây checklist hôm nay được tạo khi có người mở xem. Nay hệ thống tạo sẵn lúc 00:05 mỗi ngày cho mọi ngựa đang có Groom. Mở xem không tạo gì.
2. Ngoài lúc 00:05, checklist hôm nay còn được tạo ngay khi:
   - ngựa được giao Groom trong ngày mà chưa có checklist hôm nay;
   - HT gắn việc riêng bắt đầu từ hôm nay cho ngựa chưa có checklist hôm nay.
3. FE cần xử lý trường hợp chưa có checklist:
   - `GET /grooms/me/today`: `checklist` có thể là `null` (ngày không có việc nào cho ngựa đó).
   - `GET /horses/:horseId/checklists`: có thể trả mảng rỗng.
   - Gợi ý hiển thị: "Hôm nay không có việc chăm sóc".
4. Ngày đã qua mà chưa xong vẫn chuyển `INCOMPLETE` như cũ. Nay ngày không ai mở checklist cũng có dòng `INCOMPLETE`, nên lịch sử không còn bị thiếu ngày.
