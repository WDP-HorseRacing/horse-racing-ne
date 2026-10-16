# Flow 4 — Chăm sóc chuồng trại và dinh dưỡng hằng ngày

> Cập nhật: 14/10/2026

## I. Đề bài liên quan

**GROOM**

- Xem sơ đồ phân bổ vị trí chuồng trại và lịch trình sinh hoạt hằng ngày của từng con ngựa.
- Xem chi tiết khẩu phần ăn (ngũ cốc, cỏ, vitamin) được duyệt cho từng bữa trong ngày.
- Đánh dấu xác nhận hoàn thành công việc (Cho ăn, Vệ sinh chuồng, Tắm rửa, Ngâm chân nước đá).
- Gửi báo cáo sự cố đột xuất tại chuồng (Ngựa bỏ ăn, Có dấu hiệu đau bụng/sốt, Móng bị xước) kèm hình ảnh thực tế.
- Theo dõi danh sách vật tư (Thức ăn, Thuốc, Dụng cụ) để đề xuất bổ sung.

**CLUB MANAGER**: quản lý danh mục vật tư y tế và thức ăn.

**Cách hiểu đề bài**

- "Theo dõi danh sách vật tư tại khu vực phụ trách": CLB dùng một kho chung, nên khu vực phụ trách của Groom là toàn bộ kho chung. Groom xem số tồn, các món sắp hết và gửi đề xuất bổ sung.

## II. Mô hình

```
DANH MỤC VẬT TƯ (kho chung CLB)    món, loại, đơn vị, số tồn, ngưỡng báo thiếu
 ├─ SỔ NHẬP XUẤT                  mỗi lần đổi số tồn một dòng, chỉ thêm
 └─ ĐỀ XUẤT BỔ SUNG               Groom/HT xin, CM duyệt rồi cấp

KHẨU PHẦN (theo từng ngựa)        DRAFT → ACTIVE → ARCHIVED
 └─ DÒNG KHẨU PHẦN                bữa + món (FEED/SUPPLEMENT) + lượng

LOẠI VIỆC (danh mục CM)           cờ "áp mọi ngựa"
VIỆC RIÊNG CỦA NGỰA               HT gắn loại việc cho ngựa, từ ngày → đến ngày
CHECKLIST (ngựa × ngày)           hệ thống sinh lúc 00:05, giao cho Groom phụ trách
 └─ DÒNG CHECKLIST                một việc: xong chưa, ai tick, lúc nào

SỰ CỐ                             Groom báo, HT khu đóng
 └─ YÊU CẦU KHÁM (Flow 3)         khi khẩn, hoặc HT chuyển bác sĩ
```

| Khái niệm | Bảng | Ai tạo, sửa | Ghi chú |
|---|---|---|---|
| Vật tư | `supply_items` | Club Manager | Vừa là danh mục vừa giữ số tồn chung CLB. Loại: `FEED`, `SUPPLEMENT`, `MEDICINE`, `EQUIPMENT`. |
| Lô vật tư | `supply_lots` | Hệ thống | Một lần hàng vào kho: số nhập, số còn, đơn giá. Xuất dùng trừ lô nhập sớm nhất trước. |
| Sổ nhập xuất | `supply_stock_movements` | Hệ thống | Mỗi dòng gắn một lô: tồn ban đầu (`OPENING`), nhập hàng (`RESTOCK`), xuất dùng (`USAGE`). Không sửa, không xóa. Dòng ghi trước khi có lô (`COUNT_ADJUST` và `RESTOCK` cũ) không gắn lô, không có tiền. |
| Đề xuất bổ sung | `supply_requests` | Groom, Head Trainer gửi; Club Manager xử lý | `PENDING` → `APPROVED` → `FULFILLED`, hoặc `PENDING` → `REJECTED`. |
| Khẩu phần | `feeding_plans`, `feeding_plan_items` | Head Trainer của khu | Mỗi ngựa tối đa một bản `ACTIVE`; bản cũ giữ lại làm lịch sử. |
| Loại việc | `daily_task_types` | Club Manager | Seed sẵn: Cho ăn, Vệ sinh chuồng, Tắm rửa (áp mọi ngựa), Ngâm chân nước đá (không áp mọi ngựa). |
| Việc riêng của ngựa | `horse_daily_tasks` | Head Trainer của khu | Việc phát sinh một ngày thì từ ngày = đến ngày. |
| Checklist | `daily_checklists`, `daily_checklist_items` | Hệ thống sinh, Groom tick | Mỗi ngựa mỗi ngày một checklist. |
| Sự cố | `incidents` | Groom báo, Head Trainer của khu xử lý | `OPEN` → `RESOLVED`. |
| Phụ phí chăm sóc riêng | `horse_surcharges` | Club Manager ghi; Head Trainer xác nhận đã áp dụng | Chữ mô tả tự do + phí một ngày + từ ngày, đến ngày. Không nối tự động với khẩu phần hay việc riêng. |

"Ngày" luôn tính theo lịch CLB (giờ Việt Nam), giống Flow 2.

## III. Luật nghiệp vụ

### 1. Vật tư

1. Kho chung cả CLB, không chia theo khu.
2. Tên vật tư duy nhất trong CLB (không tính bản đã xóa). Số tồn và ngưỡng báo thiếu không âm.
3. Chỉ Club Manager thêm, sửa (tên, loại, đơn vị, ngưỡng), xóa mềm vật tư. Sửa vật tư không đổi được số tồn.
4. Kho quản lý theo lô, nhập trước xuất trước. Số tồn của vật tư luôn bằng tổng số còn của các lô. Số tồn chỉ đổi qua các đường sau, và mỗi lần đổi ghi dòng sổ (số chênh lệch, số tồn sau, lô, người làm, ghi chú) trong cùng transaction:
   1. Tồn ban đầu: thêm vật tư có số tồn khác 0 thì tạo lô đầu tiên, đơn giá do Club Manager nhập (bỏ trống là 0); ghi `OPENING`.
   2. Cấp theo đề xuất: Club Manager đánh dấu đã cấp kèm đơn giá thực trả; tạo một lô, ghi `RESTOCK` gắn mã đề xuất.
   3. Nhập hàng trực tiếp: Club Manager nhập số lượng mua về và đơn giá, không cần đề xuất; tạo một lô, ghi `RESTOCK` không gắn đề xuất.
   4. Xuất dùng: Club Manager, Head Trainer, bác sĩ hoặc Groom lấy hàng ra dùng thì ghi số lượng và ghi chú; tồn trừ ngay, không cần duyệt. Hệ thống trừ các lô còn hàng nhập sớm nhất trước, mỗi lô bị trừ ghi một dòng `USAGE`. Lấy nhiều hơn số tồn: 409.
5. Sắp hết: số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu. Xuất dùng làm số tồn xuống từ trên ngưỡng tới hoặc dưới ngưỡng thì báo mọi Club Manager một lần; các lần xuất tiếp theo khi đã dưới ngưỡng không báo lại.
6. Hệ thống không tự trừ tồn theo khẩu phần hay theo đơn thuốc; người lấy hàng tự ghi xuất dùng. Không có kiểm kê.
7. Vật tư còn đề xuất `PENDING` hoặc `APPROVED` thì không xóa được (409); Club Manager từ chối hoặc cấp xong trước.
8. Vật tư đã xóa không nhận đề xuất mới, không đưa vào khẩu phần mới; đề xuất và khẩu phần cũ vẫn hiện tên.
9. Đơn giá (VND, số nguyên, không âm) nằm trên lô; mỗi lô có giá riêng. Tiền của một dòng sổ = số chênh lệch × đơn giá lô. Trong một kỳ: tiền mua vào = tổng tiền các dòng `RESTOCK`; giá trị đã dùng = tổng tiền các dòng `USAGE`; giá trị tồn kho = tổng số còn × đơn giá của các lô. Lô tồn ban đầu không tính là mua vào; dòng ghi trước khi có lô không có tiền.

### 2. Đề xuất bổ sung

1. Groom và Head Trainer gửi đề xuất: vật tư, số lượng (> 0), ghi chú.
2. Người gửi sửa được số lượng, ghi chú khi đề xuất còn `PENDING`.
3. Club Manager duyệt hoặc từ chối đề xuất `PENDING`; từ chối bắt buộc lý do.
4. Club Manager đánh dấu đã cấp đề xuất `APPROVED` (luật 1.4.2).
5. Chuyển trạng thái sai thứ tự: 409.
6. Thông báo: đề xuất mới báo mọi Club Manager; duyệt, từ chối (kèm lý do) hoặc đã cấp báo người gửi.

### 3. Khẩu phần

1. Khẩu phần lập theo từng ngựa. Head Trainer chỉ lập, sửa, duyệt cho ngựa thuộc khu mình (403). Ngựa đã xóa: 404; ngựa chưa xếp khu, đã chuyển nhượng hoặc đã mất: 409. Ngựa giải nghệ vẫn lập được (vẫn cần ăn).
2. Mỗi dòng: bữa (`EARLY_MORNING` Sáng sớm, `NOON` Trưa, `AFTERNOON` Chiều, `EVENING` Tối), vật tư loại `FEED` hoặc `SUPPLEMENT`, lượng (> 0, theo đơn vị của vật tư), ghi chú. Khẩu phần có 1–50 dòng; trong một bữa mỗi vật tư một dòng. Không bắt đủ bốn bữa.
3. Lập một lần cho nhiều ngựa (1–50 con): mỗi con một bản `DRAFT` riêng, sau đó sửa riêng từng bản. Có thể lấy dòng từ một khẩu phần có sẵn (`copyFromPlanId`) thay cho nhập tay.
4. Bản `DRAFT` sửa (thay toàn bộ dòng) và xóa được. Bản `ACTIVE`, `ARCHIVED` không sửa, không xóa.
5. Lập nhiều ngựa một lần: một con lỗi thì không con nào được lập.
6. Bản nháp còn dòng dùng vật tư đã xóa thì không duyệt được (409); sửa bản nháp trước.
7. Duyệt: Head Trainer của khu chuyển `DRAFT` thành `ACTIVE`, ghi người duyệt, thời điểm hiệu lực. Bản `ACTIVE` cũ của ngựa (nếu có) chuyển `ARCHIVED`, ghi thời điểm hết hiệu lực. Không cần bác sĩ duyệt.
8. Ngựa chuyển sang khu khác: khẩu phần giữ nguyên; Head Trainer khu mới lập bản mới khi cần.

### 4. Loại việc và việc riêng của ngựa

1. Club Manager thêm, sửa loại việc (tên duy nhất, cờ "áp mọi ngựa", đang dùng hay ngưng). Không xóa; ngưng dùng thì checklist sinh sau đó (kể cả trong ngày) không còn việc này, checklist đã sinh giữ nguyên.
2. Head Trainer của khu gắn loại việc cho một ngựa trong khoảng ngày (từ ngày ≤ đến ngày, từ ngày không ở quá khứ, dài tối đa 366 ngày). Một loại việc không gắn trùng khoảng ngày cho cùng một ngựa (409). Loại việc đã ngưng hoặc đã "áp mọi ngựa" thì không gắn riêng được (409).
3. Gắn việc có hiệu lực hôm nay khi checklist hôm nay đã có: thêm dòng vào checklist hôm nay; checklist đang `COMPLETED` quay về `IN_PROGRESS`; báo Groom phụ trách.
4. Gỡ việc riêng: chưa tới ngày bắt đầu thì xóa; đã bắt đầu thì kết thúc ở hôm nay. Checklist đã sinh không đổi.

### 5. Checklist hằng ngày

1. Checklist thuộc một ngựa, một ngày, giao cho Groom đang phụ trách ngựa. Ngựa chưa có Groom thì không có checklist.
2. Sinh sẵn mỗi ngày: lúc 00:05 (giờ CLB) và một lần khi khởi động, hệ thống tạo checklist hôm nay cho mọi ngựa đang có Groom, từ các loại việc "áp mọi ngựa" đang dùng cộng việc riêng của ngựa có hiệu lực hôm nay. Chạy lại hoặc chạy cùng lúc không tạo trùng. Chỉ sinh cho hôm nay, không sinh ngày tương lai. Xem checklist không bao giờ tạo checklist.
   - Ngày không có việc nào thì không có checklist.
   - Ngựa được giao Groom trong ngày mà chưa có checklist hôm nay: sinh ngay lúc giao.
   - Gắn việc riêng bắt đầu hôm nay cho ngựa chưa có checklist hôm nay (ví dụ sáng nay không có việc nào): sinh ngay lúc gắn.
   - Nhờ sinh sẵn, ngày không ai mở checklist vẫn có dòng để chuyển `INCOMPLETE` (luật 6).
3. Trạng thái (lưu cột, tính lại trong cùng transaction mỗi lần tick, gỡ tick, thêm việc):
   - `PENDING`: chưa việc nào xong.
   - `IN_PROGRESS`: xong một phần.
   - `COMPLETED`: xong hết, ghi thời điểm hoàn thành.
   - `INCOMPLETE`: ngày đã qua mà chưa xong; checklist bị khóa.
4. Groom phụ trách tick hoặc gỡ tick từng việc, kèm ghi chú, chỉ trong ngày. Mỗi việc lưu ai tick, lúc nào.
5. Ghi lên checklist của ngày đã qua: 409.
6. Mỗi ngày 00:05 (giờ CLB) và một lần khi khởi động, hệ thống chuyển mọi checklist ngày cũ còn `PENDING`/`IN_PROGRESS` sang `INCOMPLETE`. Chạy lại hoặc chạy bù đều cho cùng kết quả.
7. Việc còn thiếu không dời sang ngày sau.
8. Đổi Groom phụ trách: checklist hôm nay (kể cả đã xong) chuyển cho Groom mới; việc đã tick giữ nguyên người tick.

### 6. Sự cố

1. Groom báo sự cố cho ngựa mình phụ trách (403 nếu không phụ trách): mô tả, cờ khẩn, tối đa một ảnh. Ảnh tải lên trước qua `POST /media/upload-requests` với `purpose = INCIDENT_PHOTO` (JPEG, PNG hoặc WebP, tối đa 10 MB), phải do chính người báo tải lên; mỗi ảnh gắn cho tối đa một sự cố (409). Ngựa đã xóa: 404; đã chuyển nhượng hoặc đã mất: 409.
2. Sự cố khẩn: trong cùng transaction hệ thống tạo yêu cầu khám khẩn (nguồn `GROOM_INCIDENT`, gắn sự cố, mô tả lấy từ sự cố); mọi bác sĩ nhận thông báo khẩn như Flow 3.
3. Sự cố thường: không tạo yêu cầu khám. Head Trainer của khu bấm "Chuyển bác sĩ" thì tạo yêu cầu khám gắn sự cố; tick "Khẩn" thì yêu cầu khám là khẩn và mọi bác sĩ được báo ngay. Mỗi sự cố tối đa một yêu cầu khám.
4. Sự cố thường còn mở từ 4 giờ trở lên mà chưa chuyển bác sĩ: hệ thống nhắc Head Trainer của khu và mọi Club Manager một lần (kiểm mỗi 30 phút).
5. Mọi sự cố mới đều báo Head Trainer của khu chứa ngựa (khẩn: ưu tiên cao).
6. Head Trainer của khu đóng sự cố (`OPEN` → `RESOLVED`) kèm kết quả xử lý (bắt buộc), ví dụ "Báo nhầm, ngựa bình thường" hoặc "Đã sát trùng móng".
7. Yêu cầu khám gắn sự cố còn chờ khám thì không đóng được sự cố (409). Bác sĩ khám xong hoặc bỏ qua (có lý do) rồi Head Trainer mới đóng.
8. Trạng thái sự cố và trạng thái yêu cầu khám độc lập; xem sự cố thì thấy kèm trạng thái yêu cầu khám (chỉ đọc).
   Sự cố không tự lưu mức khẩn: ô "Khẩn" lúc báo chỉ quyết có tạo yêu cầu khám khẩn ngay hay không. Mức khẩn hiện tại (`urgent` trong response) lấy theo yêu cầu khám của sự cố; chưa có yêu cầu khám thì không khẩn.
9. Groom không còn gửi yêu cầu khám trực tiếp; mọi yêu cầu từ Groom đi qua sự cố.
10. Ngựa chuyển nhượng hoặc ghi nhận đã mất: trong cùng transaction hệ thống tự đóng mọi sự cố còn mở của ngựa, kết quả "Ngựa đã chuyển nhượng" hoặc "Ngựa đã mất", không ghi người đóng (`resolvedBySystem = true`). Xem trước đổi vòng đời có `incidentsClosed` và câu tóm tắt nêu số sự cố đang mở.

### 7. Màn Hôm nay của Groom

`GET /grooms/me/today` trả từng ngựa Groom đang phụ trách:

- Khu, ô chuồng hiện tại.
- Checklist hôm nay (đã sinh theo luật 5.2; chưa có thì để trống).
- Khẩu phần `ACTIVE` theo bữa.
- Lượt tập hôm nay Groom được giao dắt (Flow 2), theo giờ bắt đầu; bỏ buổi đã hủy, bỏ lượt đã hủy, hủy do khóa, vắng, bỏ qua, không đủ điều kiện.
- Lịch chăm sóc giao cho Groom (Flow 3) đến hạn tới hết hôm nay mà chưa làm, kể cả lịch quá hạn (đánh dấu `overdue`).

Ngựa theo tên. Groom chưa phụ trách ngựa nào thì danh sách rỗng.

### 8. Phụ phí chăm sóc riêng

1. Chi phí nuôi dưỡng của chủ = phí ngày chung của CLB + phụ phí chăm sóc riêng của từng ngựa + chi phí y tế. Không có gói.
2. Chủ muốn ngựa được chăm khác (thức ăn tốt hơn, ngâm đá mỗi ngày...) thì thỏa thuận với CLB; Club Manager ghi phụ phí cho ngựa: nội dung (chữ tự do, tối đa 500 ký tự), phí một ngày (> 0), từ ngày, đến ngày. Từ ngày không ở quá khứ, đến ngày không trước từ ngày (400). Ngựa phải còn ở CLB (đang hoạt động hoặc giải nghệ), không thì 409.
3. Ghi xong hệ thống báo Head Trainer khu của ngựa (ngựa chưa xếp khu hoặc khu chưa có Head Trainer hoạt động thì không ai nhận, không chặn ghi). Head Trainer tự sắp xếp theo nội dung (sửa khẩu phần, gắn việc riêng, hoặc việc ngoài hệ thống), rồi bấm "Đã áp dụng" (`POST /horse-surcharges/:id/apply`): chỉ Head Trainer khu hiện tại của ngựa (403), mỗi khoản xác nhận một lần, khoản đã kết thúc thì 409. Hệ thống lưu ai xác nhận, lúc nào; không tự kiểm từng mục của nội dung.
   - Ngựa chuyển khu không làm mất xác nhận: khẩu phần và việc riêng gắn với con ngựa nên vẫn còn ở khu mới.
   - Club Manager xem các khoản chưa áp dụng, chưa kết thúc (`GET /horse-surcharges/unapplied`) kèm tên ngựa, khu hiện tại và Head Trainer đang phụ trách (null là chưa xếp khu hoặc chưa có Head Trainer), để xếp khu hoặc nhắc Head Trainer.
   - Tiền tính từ ngày bắt đầu, không phụ thuộc đã xác nhận hay chưa.
4. Kết thúc sớm (khoản đang tính): đến ngày thành hôm nay, hôm nay vẫn tính phí; khoản chưa bắt đầu hoặc đã kết thúc thì 409. Xóa chỉ khi chưa tới từ ngày; đã bắt đầu thì 409, phải kết thúc sớm. Không sửa nội dung hay số tiền; ghi sai thì xóa (chưa bắt đầu) hoặc kết thúc sớm rồi ghi khoản mới.
5. Tính tiền theo từng ngày trong khoảng, cùng cách phí ngày: ngày tính cho người là chủ lúc hết ngày, chỉ tính ngày ngựa còn ở CLB lúc hết ngày. Báo cáo chi phí của chủ và báo cáo tài chính CLB có thêm cột `surcharge`, cộng vào `total`.
6. Ghi, xác nhận áp dụng, kết thúc sớm, xóa đều ghi nhật ký (`HORSE_SURCHARGE`).

### 9. Phân quyền

| Thao tác | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Xem vật tư, sắp hết, lô, sổ nhập xuất | Có | Có | Có | Có | Không |
| Thêm, sửa, xóa vật tư | Có | Không | Không | Không | Không |
| Nhập hàng trực tiếp | Có | Không | Không | Không | Không |
| Xuất dùng | Có | Có | Có | Có | Không |
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
| Xem phụ phí của ngựa | Tất cả | Ngựa thuộc khu mình | Không | Không | Ngựa của mình |
| Ghi, kết thúc sớm, xóa phụ phí; xem khoản chưa áp dụng | Có | Không | Không | Không | Không |
| Xác nhận đã áp dụng phụ phí | Không | Ngựa thuộc khu mình | Không | Không | Không |

Sai vai trò hoặc ngoài phạm vi: 403. Không tìm thấy: 404. Sai trạng thái: 409.

## IV. API

| Phương thức | Đường dẫn | Ai gọi | Công dụng |
|---|---|---|---|
| GET | `/supplies/items` | CM, HT, VET, GROOM | Danh sách vật tư `?category&search&page&limit` |
| GET | `/supplies/items/low-stock` | CM, HT, VET, GROOM | Vật tư sắp hết |
| GET | `/supplies/items/:id` | CM, HT, VET, GROOM | Một vật tư |
| POST | `/supplies/items` | CM | Thêm `{ name, category, unit, quantityOnHand?, openingUnitPrice?, reorderThreshold }` |
| PATCH | `/supplies/items/:id` | CM | Sửa tên, loại, đơn vị, ngưỡng |
| DELETE | `/supplies/items/:id` | CM | Xóa mềm |
| POST | `/supplies/items/:id/receipts` | CM | Nhập hàng trực tiếp `{ quantity, unitPrice, note? }` |
| POST | `/supplies/items/:id/usages` | CM, HT, VET, GROOM | Xuất dùng `{ quantity, note? }` |
| GET | `/supplies/items/:id/lots` | CM, HT, VET, GROOM | Các lô của vật tư (số nhập, số còn, đơn giá), lô nhập sớm nhất trước |
| GET | `/supplies/items/:id/movements` | CM, HT, VET, GROOM | Sổ nhập xuất của vật tư kèm lô, đơn giá, tiền của dòng; mới nhất trước `?page&limit` |
| GET | `/supplies/requests` | CM (tất cả), HT, GROOM (của mình) | Danh sách đề xuất `?status&page&limit` |
| GET | `/supplies/requests/:id` | như trên | Một đề xuất |
| POST | `/supplies/requests` | HT, GROOM | Gửi `{ itemId, quantity, note? }` |
| PATCH | `/supplies/requests/:id` | Người gửi | Sửa đề xuất `PENDING` |
| PATCH | `/supplies/requests/:id/status` | CM | `{ status: APPROVED \| REJECTED \| FULFILLED, reason?, unitPrice? }`; `unitPrice` bắt buộc khi FULFILLED |
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
| GET | `/horses/:horseId/checklists` | CM, HT, GROOM | Checklist theo ngày `?from&to` (YYYY-MM-DD; thiếu `from` là hôm nay, thiếu `to` thì bằng `from`; tối đa 31 ngày) |
| PATCH | `/checklist-items/:id` | GROOM | Tick, gỡ tick `{ done, note? }` |
| GET | `/grooms/me/today` | GROOM | Màn Hôm nay (luật 7) |
| POST | `/incidents` | GROOM | Báo sự cố `{ horseId, description, urgent?, photoMediaId? }` |
| GET | `/incidents` | CM, HT, VET, GROOM | Danh sách `?status&horseId&barnId&page&limit` |
| GET | `/incidents/:id` | theo quyền xem | Một sự cố, kèm trạng thái yêu cầu khám |
| POST | `/incidents/:id/refer` | HT | Chuyển bác sĩ: tạo yêu cầu khám `{ urgent? }` |
| POST | `/incidents/:id/resolve` | HT | Đóng `{ resolution }` |
| GET | `/horses/:horseId/surcharges` | CM, HT (khu mình), OWNER (ngựa mình) | Phụ phí của ngựa |
| POST | `/horses/:horseId/surcharges` | CM | Ghi phụ phí `{ description, dailyAmount, startDate, endDate }` |
| GET | `/horse-surcharges/unapplied` | CM | Khoản chưa được Head Trainer xác nhận |
| POST | `/horse-surcharges/:id/apply` | HT (khu hiện tại của ngựa) | Xác nhận đã áp dụng |
| POST | `/horse-surcharges/:id/end` | CM | Kết thúc sớm |
| DELETE | `/horse-surcharges/:id` | CM | Xóa khoản chưa bắt đầu |

Chi tiết schema: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

## Phụ lục 1: Thay đổi API cần báo FE

1. Bỏ các route stub cũ: `POST /horses/:horseId/feeding-plans`, `POST /horses/:horseId/checklists`, `PATCH /checklists/:id/complete`, `PATCH /incidents/:id/status`.
2. `PATCH /supplies/items/:id` không đổi số tồn; số tồn đổi qua nhập hàng hoặc xuất dùng.
3. Sự cố bỏ trạng thái `IN_REVIEW`.
4. Groom gọi `POST /horses/:horseId/exam-requests` nhận 403; dùng `POST /incidents`.
5. Loại vật tư mới `SUPPLEMENT`; `purpose` upload mới `INCIDENT_PHOTO`.
6. Loại thông báo mới cho sự cố và việc được thêm vào checklist.

## Phụ lục 2: Việc còn lại

- Chưa có.
