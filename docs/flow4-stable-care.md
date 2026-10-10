# Flow 4 — Chăm sóc chuồng trại và dinh dưỡng hằng ngày

> Cập nhật: 10/10/2026

## I. Đề bài liên quan

**GROOM**

- Xem sơ đồ phân bổ vị trí chuồng trại và lịch trình sinh hoạt hằng ngày của từng con ngựa.
- Xem chi tiết khẩu phần ăn (ngũ cốc, cỏ, vitamin) được duyệt cho từng bữa trong ngày.
- Đánh dấu xác nhận hoàn thành công việc (Cho ăn, Vệ sinh chuồng, Tắm rửa, Ngâm chân nước đá).
- Gửi báo cáo sự cố đột xuất tại chuồng (Ngựa bỏ ăn, Có dấu hiệu đau bụng/sốt, Móng bị xước) kèm hình ảnh thực tế.
- Theo dõi danh sách vật tư (Thức ăn, Thuốc, Dụng cụ) để đề xuất bổ sung.

**CLUB MANAGER**: quản lý danh mục vật tư y tế và thức ăn.

## II. Mô hình

```
DANH MỤC VẬT TƯ (kho chung CLB)    món, loại, đơn vị, số tồn, ngưỡng báo thiếu
 ├─ SỔ NHẬP XUẤT                  mỗi lần đổi số tồn một dòng, chỉ thêm
 └─ ĐỀ XUẤT BỔ SUNG               Groom/HT xin, CM duyệt rồi cấp

KHẨU PHẦN (theo từng ngựa)        DRAFT → ACTIVE → ARCHIVED
 └─ DÒNG KHẨU PHẦN                bữa + món (FEED/SUPPLEMENT) + lượng

LOẠI VIỆC (danh mục CM)           cờ "áp mọi ngựa"
VIỆC RIÊNG CỦA NGỰA               HT gắn loại việc cho ngựa, từ ngày → đến ngày
CHECKLIST (ngựa × ngày)           sinh khi đọc, giao cho Groom phụ trách
 └─ DÒNG CHECKLIST                một việc: xong chưa, ai tick, lúc nào

SỰ CỐ                             Groom báo, HT khu đóng
 └─ YÊU CẦU KHÁM (Flow 3)         khi khẩn, hoặc HT chuyển bác sĩ
```

| Khái niệm | Bảng | Ai tạo, sửa | Ghi chú |
|---|---|---|---|
| Vật tư | `supply_items` | Club Manager | Vừa là danh mục vừa giữ số tồn chung CLB. Loại: `FEED`, `SUPPLEMENT`, `MEDICINE`, `EQUIPMENT`. |
| Sổ nhập xuất | `supply_stock_movements` | Hệ thống | Ghi khi cấp theo đề xuất (`RESTOCK`) hoặc kiểm kê (`COUNT_ADJUST`). Không sửa, không xóa. |
| Đề xuất bổ sung | `supply_requests` | Groom, Head Trainer gửi; Club Manager xử lý | `PENDING` → `APPROVED` → `FULFILLED`, hoặc `PENDING` → `REJECTED`. |
| Khẩu phần | `feeding_plans`, `feeding_plan_items` | Head Trainer của khu | Mỗi ngựa tối đa một bản `ACTIVE`; bản cũ giữ lại làm lịch sử. |
| Loại việc | `care_task_types` | Club Manager | Seed sẵn: Cho ăn, Vệ sinh chuồng, Tắm rửa (áp mọi ngựa), Ngâm chân nước đá (không áp mọi ngựa). |
| Việc riêng của ngựa | `horse_care_tasks` | Head Trainer của khu | Việc phát sinh một ngày thì từ ngày = đến ngày. |
| Checklist | `daily_checklists`, `daily_checklist_items` | Hệ thống sinh, Groom tick | Mỗi ngựa mỗi ngày một checklist. |
| Sự cố | `incidents` | Groom báo, Head Trainer của khu xử lý | `OPEN` → `RESOLVED`. |

"Ngày" luôn tính theo lịch CLB (giờ Việt Nam), giống Flow 2.

## III. Luật nghiệp vụ

### 1. Vật tư

1. Kho chung cả CLB, không chia theo khu.
2. Tên vật tư duy nhất trong CLB (không tính bản đã xóa). Số tồn và ngưỡng báo thiếu không âm.
3. Chỉ Club Manager thêm, sửa (tên, loại, đơn vị, ngưỡng), xóa mềm vật tư. Sửa vật tư không đổi được số tồn.
4. Số tồn chỉ đổi qua hai đường, và mỗi lần đổi ghi một dòng sổ (số chênh lệch, số tồn sau, người làm, ghi chú) trong cùng transaction:
   1. Kiểm kê: Club Manager, Head Trainer hoặc Groom nhập số đếm thực tế; hệ thống ghi chênh lệch `COUNT_ADJUST` và lưu lần kiểm kê gần nhất (ai, lúc nào). Thêm vật tư có số tồn ban đầu khác 0 cũng ghi một dòng `COUNT_ADJUST`.
   2. Cấp theo đề xuất: Club Manager đánh dấu đã cấp, cộng số lượng đề xuất vào tồn và ghi `RESTOCK` gắn mã đề xuất.
5. Sắp hết: số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu.
6. Hệ thống không tự trừ tồn theo khẩu phần hay theo đơn thuốc.
7. Vật tư còn đề xuất `PENDING` hoặc `APPROVED` thì không xóa được (409); Club Manager từ chối hoặc cấp xong trước.
8. Vật tư đã xóa không nhận đề xuất mới, không đưa vào khẩu phần mới; đề xuất và khẩu phần cũ vẫn hiện tên.

### 2. Đề xuất bổ sung

1. Groom và Head Trainer gửi đề xuất: vật tư, số lượng (> 0), ghi chú.
2. Người gửi sửa được số lượng, ghi chú khi đề xuất còn `PENDING`.
3. Club Manager duyệt hoặc từ chối đề xuất `PENDING`; từ chối bắt buộc lý do.
4. Club Manager đánh dấu đã cấp đề xuất `APPROVED` (luật 1.4.2).
5. Chuyển trạng thái sai thứ tự: 409.

### 3. Khẩu phần

1. Khẩu phần lập theo từng ngựa. Head Trainer chỉ lập cho ngựa thuộc khu mình; ngựa đã xóa, đã chết, đã chuyển nhượng hoặc giải nghệ thì không lập được.
2. Mỗi dòng: bữa (`EARLY_MORNING` Sáng sớm, `NOON` Trưa, `AFTERNOON` Chiều, `EVENING` Tối), vật tư loại `FEED` hoặc `SUPPLEMENT`, lượng (> 0, theo đơn vị của vật tư), ghi chú. Khẩu phần có 1–50 dòng; trong một bữa mỗi vật tư một dòng. Không bắt đủ bốn bữa.
3. Lập một lần cho nhiều ngựa (1–50 con): mỗi con một bản `DRAFT` riêng, sau đó sửa riêng từng bản. Có thể lấy dòng từ một khẩu phần có sẵn (`copyFromPlanId`) thay cho nhập tay.
4. Bản `DRAFT` sửa (thay toàn bộ dòng) và xóa được. Bản `ACTIVE`, `ARCHIVED` không sửa, không xóa.
5. Duyệt: Head Trainer của khu chuyển `DRAFT` thành `ACTIVE`, ghi người duyệt, thời điểm hiệu lực. Bản `ACTIVE` cũ của ngựa (nếu có) chuyển `ARCHIVED`, ghi thời điểm hết hiệu lực. Không cần bác sĩ duyệt.
6. Ngựa chuyển sang khu khác: khẩu phần giữ nguyên; Head Trainer khu mới lập bản mới khi cần.

### 4. Loại việc và việc riêng của ngựa

1. Club Manager thêm, sửa loại việc (tên duy nhất, cờ "áp mọi ngựa", đang dùng hay ngưng). Không xóa; ngưng dùng thì từ ngày sau không còn sinh vào checklist.
2. Head Trainer của khu gắn loại việc cho một ngựa trong khoảng ngày (từ ngày ≤ đến ngày, từ ngày không ở quá khứ). Một loại việc không gắn trùng khoảng ngày cho cùng một ngựa.
3. Gắn việc có hiệu lực hôm nay khi checklist hôm nay đã sinh: thêm dòng vào checklist hôm nay; checklist đang `COMPLETED` quay về `IN_PROGRESS`; báo Groom phụ trách.
4. Gỡ việc riêng: chưa tới ngày bắt đầu thì xóa; đã bắt đầu thì kết thúc ở hôm nay. Checklist đã sinh không đổi.

### 5. Checklist hằng ngày

1. Checklist thuộc một ngựa, một ngày, giao cho Groom đang phụ trách ngựa. Ngựa chưa có Groom thì không có checklist.
2. Sinh khi đọc: lần đầu có người xem checklist hôm nay của ngựa (Groom mở màn Hôm nay, hoặc xem theo ngựa), hệ thống tạo checklist từ các loại việc "áp mọi ngựa" đang dùng cộng việc riêng của ngựa có hiệu lực hôm nay. Đọc lại hoặc hai người đọc cùng lúc không tạo trùng. Chỉ sinh cho hôm nay, không sinh ngày tương lai.
3. Trạng thái (lưu cột, tính lại trong cùng transaction mỗi lần tick, gỡ tick, thêm việc):
   - `PENDING`: chưa việc nào xong.
   - `IN_PROGRESS`: xong một phần.
   - `COMPLETED`: xong hết, ghi thời điểm hoàn thành.
   - `INCOMPLETE`: ngày đã qua mà chưa xong; checklist bị khóa.
4. Groom phụ trách tick hoặc gỡ tick từng việc, kèm ghi chú, chỉ trong ngày. Mỗi việc lưu ai tick, lúc nào.
5. Ghi lên checklist của ngày đã qua: 409.
6. Mỗi ngày 00:05 (giờ CLB) hệ thống chuyển mọi checklist ngày cũ còn `PENDING`/`IN_PROGRESS` sang `INCOMPLETE`. Chạy lại hoặc chạy bù đều cho cùng kết quả.
7. Việc còn thiếu không dời sang ngày sau.
8. Đổi Groom phụ trách: checklist hôm nay chưa xong chuyển cho Groom mới.

### 6. Sự cố

1. Groom báo sự cố cho ngựa mình phụ trách: mô tả, cờ khẩn, tối đa một ảnh. Ảnh tải lên trước qua `POST /media/upload-requests` với `purpose = INCIDENT_PHOTO` (JPEG, PNG hoặc WebP), phải do chính người báo tải lên.
2. Sự cố khẩn: trong cùng transaction hệ thống tạo yêu cầu khám khẩn (nguồn `GROOM_INCIDENT`, gắn sự cố, mô tả lấy từ sự cố); mọi bác sĩ nhận thông báo khẩn như Flow 3.
3. Sự cố thường: không tạo yêu cầu khám. Head Trainer của khu bấm "Chuyển bác sĩ" thì tạo yêu cầu khám (thường) gắn sự cố. Mỗi sự cố tối đa một yêu cầu khám.
4. Mọi sự cố mới đều báo Head Trainer của khu chứa ngựa (khẩn: ưu tiên cao).
5. Head Trainer của khu đóng sự cố (`OPEN` → `RESOLVED`) kèm kết quả xử lý (bắt buộc), ví dụ "Báo nhầm, ngựa bình thường" hoặc "Đã sát trùng móng".
6. Yêu cầu khám gắn sự cố còn chờ khám thì không đóng được sự cố (409). Bác sĩ khám xong hoặc bỏ qua (có lý do) rồi Head Trainer mới đóng.
7. Trạng thái sự cố và trạng thái yêu cầu khám độc lập; xem sự cố thì thấy kèm trạng thái yêu cầu khám (chỉ đọc).
8. Groom không còn gửi yêu cầu khám trực tiếp; mọi yêu cầu từ Groom đi qua sự cố.

### 7. Màn Hôm nay của Groom

`GET /grooms/me/today` trả từng ngựa Groom đang phụ trách:

- Khu, ô chuồng hiện tại.
- Checklist hôm nay (sinh nếu chưa có, luật 5.2).
- Khẩu phần `ACTIVE` theo bữa.
- Lượt tập hôm nay Groom được giao dắt (Flow 2).
- Lịch chăm sóc tới hạn hôm nay được giao cho Groom (Flow 3).

### 8. Phân quyền

| Thao tác | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Xem vật tư, sắp hết, sổ nhập xuất | Có | Có | Có | Có | Không |
| Thêm, sửa, xóa vật tư | Có | Không | Không | Không | Không |
| Kiểm kê | Có | Có | Không | Có | Không |
| Gửi, sửa đề xuất | Không | Của mình | Không | Của mình | Không |
| Xem đề xuất | Tất cả | Của mình | Không | Của mình | Không |
| Duyệt, từ chối, cấp | Có | Không | Không | Không | Không |
| Xem khẩu phần (cả lịch sử) | Tất cả | Ngựa thuộc khu mình | Tất cả | Chỉ bản `ACTIVE` của ngựa mình phụ trách | Không |
| Lập, sửa, xóa nháp, duyệt khẩu phần | Không | Ngựa thuộc khu mình | Không | Không | Không |
| Loại việc | Thêm, sửa, xem | Xem | Xem | Xem | Không |
| Gắn, gỡ việc riêng của ngựa | Không | Ngựa thuộc khu mình | Không | Không | Không |
| Xem checklist | Tất cả | Ngựa thuộc khu mình | Không | Ngựa mình phụ trách | Không |
| Tick, gỡ tick | Không | Không | Không | Checklist giao cho mình | Không |
| Báo sự cố | Không | Không | Không | Ngựa mình phụ trách | Không |
| Xem sự cố | Tất cả | Ngựa thuộc khu mình | Tất cả | Sự cố mình báo | Không |
| Chuyển bác sĩ, đóng sự cố | Không | Ngựa thuộc khu mình | Không | Không | Không |

Sai vai trò hoặc ngoài phạm vi: 403. Không tìm thấy: 404. Sai trạng thái: 409.

## IV. API

| Phương thức | Đường dẫn | Ai gọi | Công dụng |
|---|---|---|---|
| GET | `/supplies/items` | CM, HT, VET, GROOM | Danh sách vật tư `?category&search&page&limit` |
| GET | `/supplies/items/low-stock` | CM, HT, VET, GROOM | Vật tư sắp hết |
| GET | `/supplies/items/:id` | CM, HT, VET, GROOM | Một vật tư |
| POST | `/supplies/items` | CM | Thêm `{ name, category, unit, quantityOnHand?, reorderThreshold }` |
| PATCH | `/supplies/items/:id` | CM | Sửa tên, loại, đơn vị, ngưỡng |
| DELETE | `/supplies/items/:id` | CM | Xóa mềm |
| POST | `/supplies/items/:id/stock-counts` | CM, HT, GROOM | Kiểm kê `{ quantityOnHand, note? }` |
| GET | `/supplies/items/:id/movements` | CM, HT, VET, GROOM | Sổ nhập xuất của vật tư, mới nhất trước `?page&limit` |
| GET | `/supplies/requests` | CM (tất cả), HT, GROOM (của mình) | Danh sách đề xuất `?status&page&limit` |
| GET | `/supplies/requests/:id` | như trên | Một đề xuất |
| POST | `/supplies/requests` | HT, GROOM | Gửi `{ itemId, quantity, note? }` |
| PATCH | `/supplies/requests/:id` | Người gửi | Sửa đề xuất `PENDING` |
| PATCH | `/supplies/requests/:id/status` | CM | `{ status: APPROVED \| REJECTED \| FULFILLED, reason? }` |
| GET | `/horses/:horseId/feeding-plans` | CM, HT, VET, GROOM | Khẩu phần của ngựa `?status` (GROOM chỉ nhận bản `ACTIVE`) |
| POST | `/feeding-plans` | HT | Lập nháp `{ horseIds, items? \| copyFromPlanId?, note? }` |
| GET | `/feeding-plans/:id` | theo quyền xem | Một khẩu phần |
| PUT | `/feeding-plans/:id` | HT | Thay dòng của bản nháp `{ items, note? }` |
| DELETE | `/feeding-plans/:id` | HT | Xóa bản nháp |
| POST | `/feeding-plans/:id/approve` | HT | Duyệt, bản `ACTIVE` cũ thành `ARCHIVED` |
| GET | `/care-task-types` | CM, HT, VET, GROOM | Danh mục loại việc |
| POST | `/care-task-types` | CM | Thêm `{ name, appliesToAll }` |
| PATCH | `/care-task-types/:id` | CM | Sửa `{ name?, appliesToAll?, active? }` |
| GET | `/horses/:horseId/care-tasks` | CM, HT, GROOM | Việc riêng của ngựa |
| POST | `/horses/:horseId/care-tasks` | HT | Gắn `{ taskTypeId, fromDate, toDate, note? }` |
| DELETE | `/horse-care-tasks/:id` | HT | Gỡ việc riêng (luật 4.4) |
| GET | `/horses/:horseId/checklists` | CM, HT, GROOM | Checklist theo ngày `?from&to` (mặc định hôm nay) |
| PATCH | `/checklist-items/:id` | GROOM | Tick, gỡ tick `{ done, note? }` |
| GET | `/grooms/me/today` | GROOM | Màn Hôm nay (luật 7) |
| POST | `/incidents` | GROOM | Báo sự cố `{ horseId, description, urgent?, photoMediaId? }` |
| GET | `/incidents` | CM, HT, VET, GROOM | Danh sách `?status&horseId&barnId&page&limit` |
| GET | `/incidents/:id` | theo quyền xem | Một sự cố, kèm trạng thái yêu cầu khám |
| POST | `/incidents/:id/refer` | HT | Chuyển bác sĩ: tạo yêu cầu khám |
| POST | `/incidents/:id/resolve` | HT | Đóng `{ resolution }` |

Chi tiết schema: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

## Phụ lục 1: Thay đổi API cần báo FE

1. Bỏ các route stub cũ: `POST /horses/:horseId/feeding-plans`, `POST /horses/:horseId/checklists`, `PATCH /checklists/:id/complete`, `PATCH /incidents/:id/status`.
2. `PATCH /supplies/items/:id` không còn đổi số tồn; dùng kiểm kê.
3. Sự cố bỏ trạng thái `IN_REVIEW`.
4. Groom gọi `POST /horses/:horseId/exam-requests` nhận 403; dùng `POST /incidents`.
5. Loại vật tư mới `SUPPLEMENT`; `purpose` upload mới `INCIDENT_PHOTO`.
6. Loại thông báo mới cho sự cố và việc được thêm vào checklist.

## Phụ lục 2: Việc còn lại

- Chưa có.
