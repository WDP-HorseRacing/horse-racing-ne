# Flow 4 — Chăm sóc chuồng trại và dinh dưỡng hằng ngày

> Cập nhật: 27/10/2026

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
 └─ ĐỀ XUẤT BỔ SUNG               Groom/HT/VET xin, CM duyệt rồi cấp

KHẨU PHẦN (theo từng ngựa)        DRAFT → ACTIVE → ARCHIVED
 └─ DÒNG KHẨU PHẦN                bữa + món (FEED/SUPPLEMENT) + lượng

LOẠI VIỆC (danh mục CM)           cờ "áp mọi ngựa"
VIỆC RIÊNG CỦA NGỰA               HT gắn thêm hoặc miễn loại việc cho ngựa, từ ngày → đến ngày
CHECKLIST (ngựa × ngày)           hệ thống sinh lúc 00:05, giao cho Groom phụ trách
 └─ DÒNG CHECKLIST                một việc: xong chưa, ai tick, lúc nào

SỰ CỐ                             Groom báo, HT khu đóng
 └─ YÊU CẦU KHÁM (Flow 3)         khi khẩn, hoặc HT chuyển bác sĩ
```

| Khái niệm | Bảng | Ai tạo, sửa | Ghi chú |
|---|---|---|---|
| Vật tư | `supply_items` | Club Manager | Vừa là danh mục vừa giữ số tồn chung CLB. Loại: `FEED`, `SUPPLEMENT`, `MEDICINE`, `EQUIPMENT`. |
| Lô vật tư | `supply_lots` | Hệ thống | Một lần hàng vào kho: số nhập, số còn, đơn giá. Xuất dùng trừ lô nhập sớm nhất trước. |
| Sổ nhập xuất | `supply_stock_movements` | Hệ thống | Mỗi dòng gắn một lô: tồn ban đầu (`OPENING`), nhập hàng (`RESTOCK`), xuất dùng (`USAGE`), hủy lần xuất (`USAGE_REVERSAL`). Các dòng của một lần xuất và dòng hủy nó dùng chung mã lần xuất (`usage_id`). Không sửa, không xóa. Dòng ghi trước khi có lô (`COUNT_ADJUST` và `RESTOCK` cũ) không gắn lô, không có tiền. |
| Đề xuất bổ sung | `supply_requests` | Groom, Head Trainer, Veterinarian gửi; Club Manager xử lý | `PENDING` → `APPROVED` → `FULFILLED`, hoặc `PENDING` → `REJECTED`, hoặc `APPROVED` → `CANCELLED`. |
| Khẩu phần | `feeding_plans`, `feeding_plan_items` | Head Trainer của khu | Mỗi ngựa tối đa một bản `ACTIVE`; bản cũ giữ lại làm lịch sử. |
| Loại việc | `daily_task_types` | Club Manager | Migration tạo sẵn: Cho ăn, Vệ sinh chuồng, Tắm rửa (áp mọi ngựa), Ngâm chân nước đá (không áp mọi ngựa). Seed demo tách "Cho ăn" thành "Cho ăn sáng" và "Cho ăn tối". |
| Việc riêng của ngựa | `horse_daily_tasks` | Head Trainer của khu; bác sĩ mọi ngựa | Cột `mode`: `EXTRA` gắn thêm loại việc không áp mọi ngựa, `EXEMPT` miễn loại việc đang áp mọi ngựa. Việc phát sinh một ngày thì từ ngày = đến ngày. |
| Checklist | `daily_checklists`, `daily_checklist_items` | Hệ thống sinh, Groom tick | Mỗi ngựa mỗi ngày một checklist. |
| Sự cố | `incidents` | Groom báo, Head Trainer của khu xử lý | `OPEN` → `RESOLVED`. |
| Phụ phí chăm sóc riêng | `horse_surcharges` | Club Manager ghi; Head Trainer xác nhận đã áp dụng | Chữ mô tả tự do + phí một ngày + từ ngày, đến ngày. Không nối tự động với khẩu phần hay việc riêng. |

"Ngày" luôn tính theo lịch CLB (giờ Việt Nam), giống Flow 2.

## III. Luật nghiệp vụ

### 1. Vật tư

1. Kho chung cả CLB, không chia theo khu.
2. Tên vật tư duy nhất trong CLB, không phân biệt hoa thường ("Cám A" và "cám a" trùng; không tính bản đã xóa). Số tồn và ngưỡng báo thiếu không âm.
3. Chỉ Club Manager thêm, sửa (tên, loại, đơn vị, ngưỡng), xóa mềm vật tư. Sửa vật tư không đổi được số tồn.
   - Vật tư đã có dòng sổ khác `OPENING` (nhập hàng, xuất dùng, hủy lần xuất...) thì không đổi đơn vị hoặc loại: 409 gắn với ô `unit` (hoặc `category`) "Vật tư đã có nhập xuất kho, không đổi được đơn vị. Hãy tạo vật tư mới" ("... không đổi được loại..."). Gửi cả hai thì báo ô `unit`. Gửi đúng giá trị đang có không tính là đổi. Tên, ngưỡng vẫn sửa được.
   - Vật tư mới chỉ có dòng `OPENING` (tạo nhầm) vẫn đổi được đơn vị, loại.
   - Lý do: đổi đơn vị sau khi đã nhập xuất làm sổ và số tồn cũ đọc theo đơn vị mới (500 kg thành 500 bao); đổi loại cho phép Groom lấy thuốc bằng cách đổi nhãn khỏi `MEDICINE`, lách luật chỉ bác sĩ và Club Manager xuất thuốc.
   - Thứ tự lỗi khi sửa: không có vật tư (404) → đổi đơn vị, loại khi đã có nhập xuất (409) → trùng tên (409).
4. Kho quản lý theo lô, nhập trước xuất trước. Số tồn của vật tư luôn bằng tổng số còn của các lô. Số tồn chỉ đổi qua các đường sau, và mỗi lần đổi ghi dòng sổ (số chênh lệch, số tồn sau, lô, người làm, ghi chú) trong cùng transaction:
   1. Tồn ban đầu: thêm vật tư có số tồn khác 0 thì tạo lô đầu tiên, đơn giá do Club Manager nhập (bỏ trống là 0); ghi `OPENING`.
   2. Cấp theo đề xuất: Club Manager đánh dấu đã cấp kèm số lượng thực nhận và đơn giá thực trả; tạo một lô đúng số thực nhận, ghi `RESTOCK` gắn mã đề xuất.
   3. Nhập hàng trực tiếp: Club Manager nhập số lượng mua về và đơn giá, không cần đề xuất; tạo một lô, ghi `RESTOCK` không gắn đề xuất.
   4. Xuất dùng: Club Manager, Head Trainer, bác sĩ hoặc Groom lấy hàng ra dùng thì ghi số lượng và ghi chú (bắt buộc, chỉ có khoảng trắng coi như trống: 400); tồn trừ ngay, không cần duyệt. Vật tư loại `MEDICINE` chỉ bác sĩ và Club Manager xuất được (Head Trainer, Groom: 403), vì thuốc do bác sĩ cấp và cho dùng. Thứ tự lỗi: ghi chú trống (400) → không có vật tư (404) → không được xuất loại này (403) → vượt tồn (409). Hệ thống trừ các lô còn hàng nhập sớm nhất trước, mỗi lô bị trừ ghi một dòng `USAGE`, mọi dòng của lần xuất chung một mã lần xuất.
   5. Hủy lần xuất ghi nhầm: người xuất tự hủy trong 24 giờ kể từ lúc xuất, Club Manager hủy bất kỳ lúc nào (người khác hoặc quá hạn: 403); lý do bắt buộc. Hệ thống cộng trả đúng số đã trừ vào từng lô và vào số tồn, mỗi lô ghi một dòng `USAGE_REVERSAL` cùng mã lần xuất, ghi nhật ký. Hủy lại lần đã hủy: 409, kể cả khi hai người bấm cùng lúc. Tồn vượt lại ngưỡng báo thiếu thì không báo gì. Muốn sửa số lượng thì hủy rồi xuất lại số đúng. Lần xuất ghi trước khi có mã lần xuất không hủy được; sai thì chờ kiểm kê (chưa làm).
5. Sắp hết: số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu. Xuất dùng làm số tồn xuống từ trên ngưỡng tới hoặc dưới ngưỡng thì báo mọi Club Manager một lần; các lần xuất tiếp theo khi đã dưới ngưỡng không báo lại.
6. Hệ thống không tự trừ tồn theo khẩu phần hay theo đơn thuốc; người lấy hàng tự ghi xuất dùng. Chưa có kiểm kê và ghi hao hụt.
7. Vật tư còn đề xuất `PENDING` hoặc `APPROVED` thì không xóa được (409); Club Manager từ chối, cấp hoặc hủy xong trước. Đề xuất `REJECTED`, `FULFILLED`, `CANCELLED` không chặn xóa.
8. Vật tư đã xóa không nhận đề xuất mới, không đưa vào khẩu phần mới; đề xuất và khẩu phần cũ vẫn hiện tên.
9. Đơn giá (VND, số nguyên, không âm) nằm trên lô; mỗi lô có giá riêng. Tiền của một dòng sổ = số chênh lệch × đơn giá lô, làm tròn nửa xa số 0 tới đồng theo từng dòng; mọi tổng tiền dưới đây cộng các dòng đã làm tròn, không làm tròn lại tổng. Trong một kỳ: tiền mua vào = tổng tiền các dòng `RESTOCK`; giá trị đã dùng = tổng tiền các dòng `USAGE` của các lần xuất chưa bị hủy (lần xuất đã hủy coi như chưa từng có, kể cả khi hủy ở kỳ sau, nên báo cáo kỳ gốc tự đổi số); dòng `USAGE_REVERSAL` không tính vào mua vào hay đã dùng; giá trị tồn kho cuối kỳ (`supplies.inventoryValue` trong báo cáo tài chính CLB) = tổng tiền mọi dòng sổ có lô tới hết ngày cuối kỳ, bỏ lần xuất đã hủy và dòng hủy; dòng điều chỉnh không có lô không có tiền; vật tư đã xóa vẫn tính. Lô tồn ban đầu không tính là mua vào; dòng ghi trước khi có lô không có tiền.

### 2. Đề xuất bổ sung

1. Groom, Head Trainer và Veterinarian gửi đề xuất cho mọi loại vật tư: vật tư, ghi chú. Đề xuất không có số lượng; người gửi ghi nhu cầu (nếu muốn) vào ghi chú.
2. Người gửi sửa được ghi chú khi đề xuất còn `PENDING`.
3. Club Manager duyệt hoặc từ chối đề xuất `PENDING`; từ chối bắt buộc lý do.
4. Club Manager đánh dấu đã cấp đề xuất `APPROVED` kèm số lượng thực nhận (> 0, tối đa 2 chữ số thập phân) và đơn giá (luật 1.4.2); thiếu một trong hai: 400 báo đúng ô. Số tồn cộng đúng số thực nhận. Cột `quantity` của đề xuất là số thực nhận, chỉ có giá trị khi `FULFILLED`, trạng thái khác là null.
5. Club Manager hủy đề xuất `APPROVED` khi không cấp được (vd nhà cung cấp hết hàng), bắt buộc lý do. Đề xuất giữ người duyệt; người hủy, lúc hủy, lý do hủy lưu riêng (`cancelled_by`, `cancelled_at`, `cancellation_reason`). Người gửi không tự hủy được đề xuất.
6. Chuyển trạng thái sai thứ tự: 409 (vd hủy đề xuất `PENDING`, cấp đề xuất đã hủy).
7. Thông báo: đề xuất mới báo mọi Club Manager; duyệt, từ chối (kèm lý do), đã cấp (kèm số thực nhận) hoặc hủy (kèm lý do) báo người gửi.

### 3. Khẩu phần

1. Khẩu phần lập theo từng ngựa. Head Trainer chỉ lập, sửa, duyệt cho ngựa thuộc khu mình (403). Ngựa đã xóa: 404; ngựa chưa xếp khu, đã chuyển nhượng hoặc đã mất: 409. Ngựa giải nghệ vẫn lập được (vẫn cần ăn).
2. Mỗi dòng: bữa (`EARLY_MORNING` Sáng sớm, `NOON` Trưa, `AFTERNOON` Chiều, `EVENING` Tối), vật tư loại `FEED` hoặc `SUPPLEMENT`, lượng (> 0, theo đơn vị của vật tư), ghi chú. Khẩu phần có 1–50 dòng; trong một bữa mỗi vật tư một dòng. Không bắt đủ bốn bữa.
3. Lập một lần cho nhiều ngựa (1–50 con): mỗi con một bản `DRAFT` riêng, sau đó sửa riêng từng bản. Có thể lấy dòng từ một khẩu phần có sẵn (`copyFromPlanId`) thay cho nhập tay.
4. Bản `DRAFT` sửa (thay toàn bộ dòng) và xóa được. Bản `ACTIVE`, `ARCHIVED` không sửa, không xóa.
5. Lập nhiều ngựa một lần: một con lỗi thì không con nào được lập.
6. Bản nháp còn dòng dùng vật tư đã xóa thì không duyệt được (409); sửa bản nháp trước.
7. Duyệt: Head Trainer của khu chuyển `DRAFT` thành `ACTIVE`, ghi người duyệt, thời điểm hiệu lực. Bản `ACTIVE` cũ của ngựa (nếu có) chuyển `ARCHIVED`, ghi thời điểm hết hiệu lực. Không cần bác sĩ duyệt.
8. Ngựa chuyển sang khu khác: khẩu phần giữ nguyên; Head Trainer khu mới lập bản mới khi cần.
9. Ngựa chuyển nhượng hoặc ghi nhận đã mất: trong cùng transaction đổi vòng đời, bản `ACTIVE` chuyển `ARCHIVED` (ghi thời điểm hết hiệu lực), bản `DRAFT` bị xóa cùng các dòng, bản `ARCHIVED` giữ nguyên. Ngựa giải nghệ giữ nguyên khẩu phần.

### 4. Loại việc và việc riêng của ngựa

1. Club Manager thêm, sửa loại việc (tên duy nhất, cờ "áp mọi ngựa", đang dùng hay ngưng). Không xóa; ngưng dùng thì checklist sinh sau đó (kể cả trong ngày) không còn việc này, và checklist hôm nay bỏ dòng chưa tick của việc này (dòng đã tick giữ nguyên).
   - Loại việc đã có dòng trong checklist (bất kỳ ngày nào) thì không đổi tên (409 "Loại việc đã dùng trong checklist, không đổi tên được"), để checklist cũ giữ đúng tên; muốn đổi thì tạo loại mới rồi ngưng loại cũ. Chưa dùng ngày nào thì đổi tên được.
   - Mỗi loại việc là một dòng trong checklist mỗi ngày. Việc làm nhiều lần trong ngày thì Club Manager khai mỗi lần một loại việc, ví dụ "Cho ăn sáng" và "Cho ăn tối".
   - Khẩu phần (các bữa và món ăn) chỉ là thực đơn để Groom làm theo; khẩu phần không quyết định checklist có những dòng nào.
2. Head Trainer của khu, hoặc bác sĩ (mọi ngựa trong CLB, không giới hạn khu), gắn loại việc cho một ngựa trong khoảng ngày (từ ngày ≤ đến ngày, từ ngày không ở quá khứ, dài tối đa 366 ngày). Một loại việc không gắn trùng khoảng ngày cho cùng một ngựa (409). Loại việc đã ngưng hoặc đã "áp mọi ngựa" thì không gắn riêng được (409).
3. Gắn việc có hiệu lực hôm nay khi checklist hôm nay đã có: thêm dòng vào checklist hôm nay; checklist đang `COMPLETED` quay về `IN_PROGRESS`; báo Groom phụ trách.
4. Gỡ việc riêng: bắt đầu từ hôm nay trở đi thì xóa (gỡ nhầm thì gắn lại được ngay); bắt đầu trước hôm nay thì kết thúc ở hôm nay. Việc có hiệu lực hôm nay bị gỡ thì checklist hôm nay bỏ dòng chưa tick của việc đó (dòng đã tick giữ nguyên).
5. Miễn việc chung cho một ngựa (dòng `EXEMPT`, ví dụ ngựa sốt nên không tắm trong 5 ngày): Head Trainer của khu hoặc bác sĩ chọn một loại việc đang dùng và đang "áp mọi ngựa", khoảng ngày như luật 2, lý do bắt buộc (400 nếu thiếu). Loại việc không áp mọi ngựa: 409. Ghi nhật ký.
   - Trong khoảng miễn, checklist sinh ra không có việc đó; hết hạn thì việc tự có lại.
   - Miễn bắt đầu hôm nay khi checklist hôm nay đã sinh: bỏ dòng việc đó nếu chưa tick (dòng đã tick giữ nguyên), rồi tính lại trạng thái. Checklist hôm nay chưa sinh thì không sinh thêm, không báo Groom.
   - Gỡ dòng miễn: bắt đầu từ hôm nay trở đi thì xóa; bắt đầu trước hôm nay thì kết thúc ở hôm qua. Việc chung có lại ngay trong checklist hôm nay (chưa có checklist thì sinh) và báo Groom như luật 3.
   - Không trùng khoảng ngày với dòng khác cùng ngựa, cùng loại việc (409), dù là gắn thêm hay miễn.
6. Club Manager đổi cờ "áp mọi ngựa" của loại việc khi còn dòng gắn thêm hoặc miễn của loại đó chưa hết hạn (ngày kết thúc từ hôm nay trở đi): 409, phải gỡ các dòng đó trước.
7. Bác sĩ và Head Trainer:
   - Việc điều trị là chỉ định ngắn ngày (ngâm đá, kiêng tắm): bác sĩ và Head Trainer đều gắn, miễn, gỡ được, cùng mọi luật ở trên. Khẩu phần là dinh dưỡng thường xuyên: chỉ Head Trainer (mục 3).
   - Head Trainer chỉ làm trên ngựa thuộc khu mình (ngựa ngoài khu 403, ngựa chưa xếp khu 409). Bác sĩ làm trên mọi ngựa, kể cả ngựa chưa xếp khu. Ngựa đã chuyển nhượng hoặc đã mất: 409; hồ sơ đã xóa: 404, như nhau cho cả hai vai trò.
   - Bác sĩ gắn, miễn hoặc gỡ: báo Head Trainer của khu chứa ngựa (tên ngựa, việc, kiểu gắn thêm/miễn/gỡ, khoảng ngày, lý do nếu có, tên bác sĩ). Head Trainer của khu tự làm thì không báo. Ngựa chưa có khu hoặc khu chưa có Head Trainer hoạt động thì không ai nhận, không chặn ghi. Thông báo cho Groom (luật 3, luật 5) giữ nguyên.
   - Nhật ký ghi người làm như mọi thao tác khác.
8. Ngựa chuyển nhượng hoặc ghi nhận đã mất: trong cùng transaction đổi vòng đời, mọi việc riêng của ngựa (gắn thêm và miễn) đã bắt đầu và còn chạy sau hôm nay kết thúc ở hôm nay; việc chưa tới ngày bắt đầu bị xóa; việc đã kết thúc giữ nguyên. Không báo ai. Ngựa giải nghệ giữ nguyên việc riêng.

### 5. Checklist hằng ngày

1. Checklist thuộc một ngựa, một ngày, giao cho Groom đang phụ trách ngựa. Ngựa chưa có Groom thì không có checklist.
2. Sinh sẵn mỗi ngày: lúc 00:05 (giờ CLB) và một lần khi khởi động, hệ thống tạo checklist hôm nay cho mọi ngựa đang có Groom, từ các loại việc "áp mọi ngựa" đang dùng cộng việc riêng của ngựa có hiệu lực hôm nay. Chạy lại hoặc chạy cùng lúc không tạo trùng. Chỉ sinh cho hôm nay, không sinh ngày tương lai. Xem checklist không bao giờ tạo checklist.
   - Ngày không có việc nào thì không sinh checklist. Checklist đã sinh mà bị bỏ hết dòng (miễn, gỡ, ngưng loại việc) thì giữ lại, trạng thái `COMPLETED`; gắn việc mới trong ngày thì thêm dòng vào chính checklist đó.
   - Ngựa được giao Groom trong ngày mà chưa có checklist hôm nay: sinh ngay lúc giao.
   - Gắn việc riêng bắt đầu hôm nay cho ngựa chưa có checklist hôm nay (ví dụ sáng nay không có việc nào): sinh ngay lúc gắn.
   - Nhờ sinh sẵn, ngày không ai mở checklist vẫn có dòng để chuyển `INCOMPLETE` (luật 6).
   - Lỗi lúc sinh (ví dụ DB chập chờn): hệ thống tự thử lại sau 5, 10, 20, 40, 60 phút rồi mỗi 60 phút, tới khi đủ hoặc sang ngày mới. Mỗi lần thử chỉ sinh cho ngựa còn thiếu; checklist đã sinh (kể cả đã tick) giữ nguyên, kể cả khi danh mục loại việc vừa đổi. Chỉ thử lại khi có lỗi; không chạy lại mỗi giờ khi không lỗi. Mỗi lần lỗi ghi log ERROR.
   - Báo Club Manager: lần chạy thứ 3 (tính cả lần 00:05, tức khoảng 00:20) vẫn còn ngựa lỗi thì mọi Club Manager đang hoạt động nhận một thông báo trong ngày, kèm tên ngựa chưa có checklist. Sau đó sinh đủ (do thử lại hoặc do nút sinh lại) thì nhận thêm đúng một thông báo "Đã có đủ checklist hôm nay". Lỗi tự hết ở lần 2 hoặc 3 thì không báo. Tối đa 2 thông báo mỗi ngày. Postgres sập hẳn thì không ghi được thông báo, chỉ còn log. Ứng dụng khởi động lại giữa lúc đã báo lỗi và lúc sinh đủ thì không có thông báo "đã đủ".
   - Nút "Sinh lại checklist hôm nay" (chỉ Club Manager, `POST /daily-checklists/regenerate-today`): chạy ngay việc sinh cho ngựa còn thiếu, trả số checklist vừa sinh và các ngựa vẫn lỗi (tên ngựa, câu lỗi). Mỗi lần bấm ghi nhật ký. Bấm nhiều lần hoặc trùng lúc với lần thử lại không sinh trùng. Sinh đủ thì dừng thử lại.
3. Trạng thái (lưu cột, tính lại trong cùng transaction mỗi lần tick, gỡ tick, thêm việc):
   - `PENDING`: chưa việc nào xong.
   - `IN_PROGRESS`: xong một phần.
   - `COMPLETED`: xong hết (kể cả checklist không còn dòng nào), ghi thời điểm hoàn thành.
   - `INCOMPLETE`: ngày đã qua mà chưa xong; checklist bị khóa.
   - `CANCELLED`: hủy vì ngựa chuyển nhượng hoặc ghi nhận đã mất trong ngày (luật 9); checklist bị khóa.
4. Groom phụ trách tick hoặc gỡ tick từng việc, kèm ghi chú, chỉ trong ngày. Mỗi việc lưu ai tick, lúc nào. Việc không có giờ phải làm; chỉ cần xong trong ngày.
5. Ghi lên checklist của ngày đã qua: 409.
6. Mỗi ngày 00:05 (giờ CLB) và một lần khi khởi động, hệ thống chuyển mọi checklist ngày cũ còn `PENDING`/`IN_PROGRESS` sang `INCOMPLETE`. Chạy lại hoặc chạy bù đều cho cùng kết quả. Lỗi thì việc này tự thử lại riêng theo cùng nhịp ở luật 2, không chờ và không chặn việc sinh checklist hôm nay. Việc tự chuyển này không ghi nhật ký.
7. Việc còn thiếu không dời sang ngày sau.
8. Đổi Groom phụ trách: checklist hôm nay (kể cả đã xong) chuyển cho Groom mới; việc đã tick giữ nguyên người tick.
   Các lượt tập tương lai chuyển sang Groom mới (Flow 2) mà một lượt trùng giờ với lượt Groom mới đang dắt ở buổi khác thì chặn 409 cả thao tác, không lưu gì, câu báo liệt kê từng cặp buổi trùng để Head Trainer giao lại người dắt trước. Xếp ô kèm giao Groom (`PUT /horses/:id/placement`) áp cùng luật.
   - Ngựa đang ở buổi tập (có lượt Có mặt, Sẵn sàng hoặc Đang tập ở bất kỳ lớp nào): chặn 409 "Ngựa đang ở buổi tập, đổi Groom sau khi buổi kết thúc", kể cả giao Groom lần đầu; hết buổi thì đổi bình thường. Lượt đang dở do HT của lớp thao tác hoặc giao riêng lượt đó cho Groom dắt hộ (Flow 2 luật 7a).
   - Lượt chuyển sang Groom mới (của Groom cũ hoặc chưa ai dắt): Chờ điểm danh và Vắng của buổi chưa hết giờ (kể cả buổi đã tới giờ bắt đầu); Không đủ điều kiện và Hủy do khóa của buổi chưa bắt đầu. Các lượt khác giữ tên người cũ.
   - Kiểm trùng giờ tính cả lượt Vắng của buổi chưa hết giờ (lượt đang chuyển và lượt Groom mới đang dắt), vì lượt Vắng còn điểm danh lại được.
9. Ngựa chuyển nhượng hoặc ghi nhận đã mất: trong cùng transaction đổi vòng đời, checklist hôm nay còn `PENDING`/`IN_PROGRESS` chuyển `CANCELLED`; việc đã tick giữ làm lịch sử; checklist đã `COMPLETED` giữ nguyên. Tick hoặc gỡ tick checklist `CANCELLED`: 409. Việc chuyển `INCOMPLETE` (luật 6) không đụng tới checklist `CANCELLED`. Ngựa giải nghệ giữ nguyên checklist.

### 6. Sự cố

1. Mọi Groom đang hoạt động báo được sự cố cho ngựa đang ở CLB, không cần đang phụ trách con đó (ví dụ Groom trực đêm thấy ngựa khác lăn lộn): mô tả, cờ khẩn, ảnh (tùy chọn, tối đa một). Ảnh tải lên trước qua `POST /media/upload-requests` với `purpose = INCIDENT_PHOTO` (JPEG, PNG hoặc WebP, tối đa 10 MB), phải do chính người báo tải lên; mỗi ảnh gắn cho tối đa một sự cố (409). Ngựa đã xóa: 404; đã chuyển nhượng hoặc đã mất: 409.
2. Sự cố khẩn: trong cùng transaction hệ thống tạo yêu cầu khám khẩn (nguồn `GROOM_INCIDENT`, gắn sự cố, mô tả lấy từ sự cố); mọi bác sĩ nhận thông báo khẩn như Flow 3.
3. Sự cố thường: không tạo yêu cầu khám. Head Trainer của khu bấm "Chuyển bác sĩ" thì tạo yêu cầu khám gắn sự cố; tick "Khẩn" thì yêu cầu khám là khẩn và mọi bác sĩ được báo ngay. Mỗi sự cố tối đa một yêu cầu khám.
4. Sự cố thường còn mở từ 4 giờ trở lên mà chưa chuyển bác sĩ (chưa có yêu cầu khám): hệ thống nhắc Head Trainer của khu và mọi Club Manager một lần (kiểm mỗi 30 phút).
5. Mọi sự cố mới đều báo Head Trainer của khu chứa ngựa (khẩn: ưu tiên cao). Groom báo không phải Groom đang phụ trách ngựa thì Groom phụ trách cũng nhận thông báo. Head Trainer, Club Manager, bác sĩ không báo sự cố; họ gửi yêu cầu khám thẳng (Flow 3).
6. Head Trainer của khu đóng sự cố (`OPEN` → `RESOLVED`) kèm kết quả xử lý (bắt buộc), ví dụ "Báo nhầm, ngựa bình thường" hoặc "Đã sát trùng móng".
7. Yêu cầu khám gắn sự cố còn chờ khám thì Head Trainer không đóng được sự cố (409 "Sự cố đang chờ bác sĩ khám, sẽ tự đóng khi bác sĩ xử lý xong"); ngựa ổn lại thì báo bác sĩ bỏ qua yêu cầu.
   - Bác sĩ khám xong hoặc bỏ qua yêu cầu khám gắn sự cố: sự cố tự đóng (`RESOLVED`), kết quả "Bác sĩ đã khám" hoặc "Bác sĩ đã bỏ qua yêu cầu khám", người đóng là bác sĩ; không gửi thêm thông báo (người báo và Groom phụ trách đã nhận "bác sĩ đã khám"). Sự cố đã đóng trước đó thì giữ nguyên.
   - Bác sĩ hủy buổi khám làm yêu cầu khám quay về chờ: sự cố đã tự đóng theo yêu cầu đó mở lại (`OPEN`); sự cố Head Trainer đóng tay hoặc đóng do đổi vòng đời thì không mở lại.
8. Xem sự cố thì thấy kèm trạng thái yêu cầu khám (chỉ đọc); sự cố có yêu cầu khám thì đóng, mở theo yêu cầu khám (luật 7).
   Groom xem (danh sách và chi tiết) sự cố mình báo, và mọi sự cố (mọi trạng thái, ai báo cũng vậy) của ngựa mình đang phụ trách. Ngựa đã chuyển cho Groom khác thì Groom cũ chỉ còn thấy sự cố mình báo. Ngoài hai trường hợp đó: 403. Đây chỉ là quyền xem; chuyển bác sĩ và đóng sự cố vẫn chỉ Head Trainer của khu.
   Sự cố không tự lưu mức khẩn: ô "Khẩn" lúc báo chỉ quyết có tạo yêu cầu khám khẩn ngay hay không. Mức khẩn hiện tại (`urgent` trong response) lấy theo yêu cầu khám của sự cố; chưa có yêu cầu khám thì không khẩn.
9. Groom không còn gửi yêu cầu khám trực tiếp; mọi yêu cầu từ Groom đi qua sự cố.
10. Ngựa chuyển nhượng hoặc ghi nhận đã mất: trong cùng transaction hệ thống tự đóng mọi sự cố còn mở của ngựa, kết quả "Ngựa đã chuyển nhượng" hoặc "Ngựa đã mất", không ghi người đóng (`resolvedBySystem = true`).
11. Sự cố lưu cách đóng (`resolutionSource`): `HEAD_TRAINER` (HT đóng tay), `EXAM` (tự đóng theo yêu cầu khám, luật 7), `LIFECYCLE` (luật 10); còn mở thì trống. Chỉ sự cố `EXAM` được mở lại khi yêu cầu khám quay về chờ. Xem trước đổi vòng đời có `incidentsClosed` và câu tóm tắt nêu số sự cố đang mở.

### 7. Màn Hôm nay của Groom

`GET /grooms/me/today` trả từng ngựa Groom đang phụ trách:

- Khu, ô chuồng hiện tại.
- Checklist hôm nay (đã sinh theo luật 5.2; chưa có thì để trống).
- Khẩu phần `ACTIVE` theo bữa.
- Lượt tập hôm nay Groom được giao dắt (Flow 2), theo giờ bắt đầu, kèm địa điểm (`location`) và mặt sân (`surface`) của buổi; bỏ buổi đã hủy, bỏ lượt đã hủy, hủy do khóa, vắng, bỏ qua, không đủ điều kiện.

Lượt Groom được giao dắt ở ngựa Groom không phụ trách (dắt hộ) nằm riêng ở `assistedRuns`, cùng bộ lọc trên, kèm tên ngựa.

Lịch hẹn khám định kỳ (Flow 3 F3.2) và lịch tái khám (Flow 3 F3.6 mục 7) hôm nay của các ngựa Groom đang phụ trách nằm ở `horseVetAppointments`: tên ngựa, loại, giờ hẹn. Chỉ để Groom chuẩn bị ngựa: không có nút hoàn tất, không nằm trong lịch chăm sóc của ngựa. Lịch hẹn ngày khác, đã hủy hoặc đã khám thì không hiện.

Ngựa theo tên. Groom chưa phụ trách ngựa nào thì danh sách ngựa rỗng, nhưng vẫn thấy lượt dắt hộ.

### 8. Phụ phí chăm sóc riêng

1. Chi phí nuôi dưỡng của chủ = phí ngày chung của CLB + phụ phí chăm sóc riêng của từng ngựa + chi phí y tế. Không có gói.
   - Phí ngày chung: Club Manager đặt mức phí áp dụng từ một ngày (từ hôm nay trở đi); mỗi ngày tính theo mức có ngày hiệu lực lớn nhất không sau ngày đó. Xóa chỉ mức chưa hiệu lực. Sửa số tiền (`PATCH /daily-fees/:id`, bắt buộc lý do) được với mức chưa hiệu lực và mức đang áp dụng; mức đã được thay bằng mức mới thì 409 "Mức phí đã được thay bằng mức mới, không sửa được". Không sửa ngày hiệu lực (gửi `effectiveFrom` là 400); sai ngày thì xóa (chưa hiệu lực) hoặc đặt mức mới. Gửi đúng số tiền đang có thì không ghi gì. Sửa ghi nhật ký (`DAILY_FEE`) kèm số tiền trước/sau và lý do, không báo chủ. Báo cáo phí tính lại theo số tiền mới cho mọi ngày mức đó áp dụng, kể cả ngày đã qua.
   - Chi phí y tế là chi phí từng buổi khám chưa hủy (Flow 3, III.6): rơi vào kỳ chứa ngày khám (lịch CLB) và tính cho người làm chủ vào lúc khám. Cột `visitCount` là số buổi khám chưa hủy trong kỳ.
   - Ngày ngựa ở CLB mà lúc hết ngày không có chủ (chỉ xảy ra sau kích hoạt lại hoặc khôi phục hồ sơ khi chủ cũ không còn hoạt động) vẫn tính phí ngày và phụ phí, tính từ lúc tạo hồ sơ. Báo cáo tài chính CLB gom phần này, cùng chi phí các buổi khám lúc ngựa không có chủ, vào mục `unowned` (Chưa có chủ) kèm số ngày tính phí; tổng `ownerCharges` = tổng các chủ + `unowned`. Báo cáo chi phí của chủ không đổi.
2. Chủ muốn ngựa được chăm khác (thức ăn tốt hơn, ngâm đá mỗi ngày...) thì thỏa thuận với CLB; Club Manager ghi phụ phí cho ngựa: nội dung (chữ tự do, tối đa 500 ký tự), phí một ngày (> 0), từ ngày, đến ngày. Từ ngày không ở quá khứ, đến ngày không trước từ ngày (400). Ngựa phải còn ở CLB (đang hoạt động hoặc giải nghệ), không thì 409.
3. Ghi xong hệ thống báo chủ ngựa (nội dung, khoảng ngày, phí một ngày) và Head Trainer khu của ngựa (ngựa chưa xếp khu hoặc khu chưa có Head Trainer hoạt động thì không ai nhận, không chặn ghi). Head Trainer tự sắp xếp theo nội dung (sửa khẩu phần, gắn việc riêng, hoặc việc ngoài hệ thống), rồi bấm "Đã áp dụng" (`POST /horse-surcharges/:id/apply`): chỉ Head Trainer khu hiện tại của ngựa (403), mỗi khoản xác nhận một lần, khoản đã kết thúc thì 409. Hệ thống lưu ai xác nhận, lúc nào; không tự kiểm từng mục của nội dung.
   - Ngựa chuyển khu không làm mất xác nhận: khẩu phần và việc riêng gắn với con ngựa nên vẫn còn ở khu mới.
   - Club Manager xem các khoản chưa áp dụng, chưa kết thúc (`GET /horse-surcharges/unapplied`) kèm tên ngựa, khu hiện tại và Head Trainer đang phụ trách (null là chưa xếp khu hoặc chưa có Head Trainer), để xếp khu hoặc nhắc Head Trainer.
   - Tiền tính từ ngày bắt đầu, không phụ thuộc đã xác nhận hay chưa.
4. Kết thúc sớm (khoản đang tính): đến ngày thành hôm nay, hôm nay vẫn tính phí; khoản chưa bắt đầu hoặc đã kết thúc thì 409. Xóa chỉ khi chưa tới từ ngày; đã bắt đầu thì 409, phải kết thúc sớm. Không sửa nội dung hay số tiền; ghi sai thì xóa (chưa bắt đầu) hoặc kết thúc sớm rồi ghi khoản mới.
5. Tính tiền theo từng ngày trong khoảng, cùng cách phí ngày: ngày tính cho người là chủ lúc hết ngày, chỉ tính ngày ngựa còn ở CLB lúc hết ngày. Báo cáo chi phí của chủ và báo cáo tài chính CLB có thêm cột `surcharge`, cộng vào `total`.
   - Báo cáo "định kỳ" của đề: chủ ngựa và Club Manager tự xem báo cáo theo khoảng ngày bất kỳ (`GET /reports/owner/costs`, `GET /reports/club/finance` với `from`, `to`), ví dụ từng tháng. Hệ thống không tự gửi báo cáo theo lịch.
   - Club Manager xem báo cáo của một chủ bằng `ownerId`: nhận tài khoản đang là chủ ngựa hoặc đã từng sở hữu ngựa (chủ cũ đã đổi vai trò vẫn xem được). Tài khoản không có, hoặc chưa từng là chủ (vd Groom): 404 "Không tìm thấy chủ ngựa".
6. Ghi, xác nhận áp dụng, kết thúc sớm, xóa đều ghi nhật ký (`HORSE_SURCHARGE`).

### 9. Phân quyền

| Thao tác | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Xem vật tư, sắp hết, lô, sổ nhập xuất | Có | Có | Có | Có | Không |
| Thêm, sửa, xóa vật tư | Có | Không | Không | Không | Không |
| Nhập hàng trực tiếp | Có | Không | Không | Không | Không |
| Xuất dùng (loại `MEDICINE`) | Có | Không | Có | Không | Không |
| Xuất dùng (loại khác) | Có | Có | Có | Có | Không |
| Hủy lần xuất | Mọi lần xuất | Lần mình xuất, trong 24 giờ | Lần mình xuất, trong 24 giờ | Lần mình xuất, trong 24 giờ | Không |
| Gửi, sửa đề xuất | Không | Của mình | Của mình | Của mình | Không |
| Xem đề xuất | Tất cả | Của mình | Của mình | Của mình | Không |
| Duyệt, từ chối, cấp | Có | Không | Không | Không | Không |
| Xem khẩu phần (cả lịch sử) | Tất cả | Ngựa thuộc khu mình | Tất cả | Chỉ bản `ACTIVE` của ngựa mình phụ trách | Không |
| Lập, sửa, xóa nháp, duyệt khẩu phần | Không | Ngựa thuộc khu mình | Không | Không | Không |
| Loại việc | Thêm, sửa, xem | Xem | Xem | Xem | Không |
| Xem việc riêng của ngựa | Tất cả | Ngựa thuộc khu mình | Tất cả | Ngựa mình phụ trách | Không |
| Gắn, miễn, gỡ việc riêng của ngựa | Không | Ngựa thuộc khu mình | Mọi ngựa | Không | Không |
| Xem checklist | Tất cả | Ngựa thuộc khu mình | Không | Ngựa mình phụ trách | Không |
| Tick, gỡ tick | Không | Không | Không | Checklist giao cho mình | Không |
| Báo sự cố | Không | Không | Không | Mọi ngựa đang ở CLB | Không |
| Xem sự cố | Tất cả | Ngựa thuộc khu mình | Tất cả | Sự cố mình báo, hoặc của ngựa mình đang phụ trách | Không |
| Chuyển bác sĩ, đóng sự cố | Không | Ngựa thuộc khu mình | Không | Không | Không |
| Xem phụ phí của ngựa | Tất cả | Ngựa thuộc khu mình | Không | Không | Ngựa của mình |
| Ghi, kết thúc sớm, xóa phụ phí; xem khoản chưa áp dụng | Có | Không | Không | Không | Không |
| Xác nhận đã áp dụng phụ phí | Không | Ngựa thuộc khu mình | Không | Không | Không |

Sai vai trò hoặc ngoài phạm vi: 403. Không tìm thấy: 404. Sai trạng thái: 409.

Nguyên tắc phạm vi của HEAD TRAINER: xem tổng quan toàn câu lạc bộ (bảng điều khiển, bảng điều khiển y tế, hồ sơ ngựa, danh sách và chi tiết khu chuồng, sơ đồ ô chuồng); thao tác và xem chi tiết công việc chỉ trong khu, lớp mình phụ trách (chỉ số buổi tập và đánh giá của lớp mình và ngựa thuộc khu mình, việc riêng của ngựa, ngưỡng nhịp tim/tốc độ).

## IV. API

| Phương thức | Đường dẫn | Ai gọi | Công dụng |
|---|---|---|---|
| GET | `/supplies/items` | CM, HT, VET, GROOM | Danh sách vật tư `?category&search&page&limit` |
| GET | `/supplies/items/low-stock` | CM, HT, VET, GROOM | Vật tư sắp hết |
| GET | `/supplies/items/:id` | CM, HT, VET, GROOM | Một vật tư |
| POST | `/supplies/items` | CM | Thêm `{ name, category, unit, quantityOnHand?, openingUnitPrice?, reorderThreshold }` |
| PATCH | `/supplies/items/:id` | CM | Sửa tên, loại, đơn vị, ngưỡng; đã có nhập xuất kho thì không đổi đơn vị, loại (409) |
| DELETE | `/supplies/items/:id` | CM | Xóa mềm |
| POST | `/supplies/items/:id/receipts` | CM | Nhập hàng trực tiếp `{ quantity, unitPrice, note? }` |
| POST | `/supplies/items/:id/usages` | CM, HT, VET, GROOM | Xuất dùng `{ quantity, note }`; thuốc chỉ CM, VET |
| POST | `/supplies/usages/:usageId/cancel` | CM, HT, VET, GROOM | Hủy lần xuất `{ reason }` (luật 1.4.5) |
| GET | `/supplies/items/:id/lots` | CM, HT, VET, GROOM | Các lô của vật tư (số nhập, số còn, đơn giá), lô nhập sớm nhất trước |
| GET | `/supplies/items/:id/movements` | CM, HT, VET, GROOM | Sổ nhập xuất của vật tư kèm lô, đơn giá, tiền của dòng; mới nhất trước `?page&limit` |
| GET | `/supplies/requests` | CM (tất cả), HT, VET, GROOM (của mình) | Danh sách đề xuất `?status&page&limit` |
| GET | `/supplies/requests/:id` | như trên | Một đề xuất |
| POST | `/supplies/requests` | HT, VET, GROOM | Gửi `{ itemId, note? }` |
| PATCH | `/supplies/requests/:id` | Người gửi | Sửa ghi chú đề xuất `PENDING` `{ note? }` |
| PATCH | `/supplies/requests/:id/status` | CM | `{ status: APPROVED \| REJECTED \| FULFILLED \| CANCELLED, reason?, quantity?, unitPrice? }`; `reason` bắt buộc khi REJECTED, CANCELLED; `quantity` (số thực nhận) và `unitPrice` bắt buộc khi FULFILLED |
| GET | `/horses/:horseId/feeding-plans` | CM, HT, VET, GROOM | Khẩu phần của ngựa `?status` (GROOM chỉ nhận bản `ACTIVE`) |
| POST | `/feeding-plans` | HT | Lập nháp `{ horseIds, items? \| copyFromPlanId?, note? }` |
| GET | `/feeding-plans/:id` | theo quyền xem | Một khẩu phần |
| PUT | `/feeding-plans/:id` | HT | Thay dòng của bản nháp `{ items, note? }` |
| DELETE | `/feeding-plans/:id` | HT | Xóa bản nháp |
| POST | `/feeding-plans/:id/approve` | HT | Duyệt, bản `ACTIVE` cũ thành `ARCHIVED` |
| GET | `/care-task-types` | CM, HT, VET, GROOM | Danh mục loại việc |
| POST | `/care-task-types` | CM | Thêm `{ name, appliesToAll }` |
| PATCH | `/care-task-types/:id` | CM | Sửa `{ name?, appliesToAll?, active? }` |
| GET | `/horses/:horseId/care-tasks` | CM, HT, VET, GROOM | Việc riêng của ngựa |
| POST | `/horses/:horseId/care-tasks` | HT, VET | Gắn thêm hoặc miễn `{ taskTypeId, mode?, fromDate, toDate, note? }` (luật 4.2, 4.5, 4.7) |
| DELETE | `/horse-care-tasks/:id` | HT, VET | Gỡ việc riêng (luật 4.4, 4.5, 4.7) |
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

- Tên vật tư dùng unique trên `lower(name)`: `lower()` gộp đúng chữ có dấu khi DB dùng locale UTF-8; trước khi chạy migration `SupplyItemNameCaseInsensitive` (và `TrainingSubjectNameCaseInsensitive`) ở môi trường mới, kiểm `SHOW lc_ctype` (DB dev `en_US.utf8`).
- Ngưng loại việc đúng lúc đang sinh checklist hôm nay có thể sót dòng của loại vừa ngưng; sửa thì phải đổi thứ tự khóa trong `ensureChecklist`.

- Việc theo giờ: mỗi loại việc có danh sách giờ, mỗi giờ sinh một dòng checklist, kèm nhắc Groom khi trễ giờ. Làm phần này thì xem lại quyết định "checklist không có giờ" (D6).
