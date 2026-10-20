# Hỏi đáp chuẩn bị bảo vệ

Cập nhật: 20/10/2026

Các câu hội đồng có thể hỏi về những quyết định nghiệp vụ "cố ý không làm" hoặc "chọn cách đơn giản", kèm câu trả lời ngắn và lý do. Mã trong ngoặc là mã mục trong bản rà nghiệp vụ.

## Nguyên tắc chung: thời điểm trên hệ thống là thời điểm ghi nhận

Áp cho ngày mất, giờ khám, lịch tập và chuyển chủ. Hệ thống không cho nhập lùi ngày giờ.

### 1. CM nhập chuyển chủ hay bán ngựa trễ thì phí ngày tính sai cho chủ cũ? (F1-5)

**Trả lời:** Quyền sở hữu trên hệ thống đổi lúc CLB ghi nhận, phí ngày tính theo đó, giống ngày mất và giờ khám. Nhập kịp thời là trách nhiệm của CLUB MANAGER.

**Lý do:**
- Hệ thống làm đúng luật đã định; ghi trễ là lỗi quy trình, giống kế toán vào sổ trễ.
- Cho nhập lùi thì phải chặn hàng loạt dữ liệu mâu thuẫn trong khoảng lùi: thông báo đã gửi, chi phí khám, phụ phí đã tính cho chủ cũ.
- Đề bài không nhắc tới chuyển nhượng; đây là phần nhóm tự thêm.
- Đánh đổi đã biết: không có đường sửa phí những ngày trễ; chủ cũ khiếu nại thì CLB xử lý ngoài hệ thống.

### 2. Sao không cho nhập ngày mất thật của ngựa? (B4)

**Trả lời:** Ngày mất là ngày CLB ghi nhận trên hệ thống. Ngựa chết thì ghi nhận ngay trong ngày; ghi trễ là lỗi thao tác.

**Lý do:**
- Nhập lùi ngày mất làm phí ngày vẫn bị tính sau ngày mất thật, và mâu thuẫn với dữ liệu ghi trong khoảng giữa (buổi khám, checklist đã tick, lượt tập).
- Đề bài không yêu cầu ngày mất.

### 3. Bác sĩ khám trên giấy rồi nhập sau thì sao? (B5)

**Trả lời:** Buổi khám luôn mang thời điểm lưu. Bác sĩ khám tại CLB và có app trong tay nên khám xong nhập liền.

**Lý do:**
- Buổi nhập lùi từng ghi đè trạng thái sức khỏe mới hơn (ngựa vừa được khám là khỏe lại thành chấn thương).
- Ngày khám quyết định tiền: nhập lùi làm chi phí rơi vào kỳ cũ hoặc tính cho chủ cũ.

### 4. Sao không cho tạo lớp, buổi tập ở quá khứ? (B7)

**Trả lời:** Buổi tập là lịch để làm: điểm danh, cho chạy, hoàn thành diễn ra trực tiếp trong buổi. Buổi đã qua giờ không làm được các bước đó, tạo ra chỉ để hệ thống tự đánh vắng cả lớp.

**Lý do:**
- Hệ thống không có chức năng nhập bù buổi tập, đề bài cũng không yêu cầu.
- Dời buổi lên sớm hơn thì sửa giờ trên app trước khi làm; lỡ làm rồi thì hủy buổi kèm lý do.

## Các quyết định khác

### 5. Ghi nhận mất nhầm con ngựa thì sửa thế nào? (F1-1)

**Trả lời:** Ghi nhận mất là trạng thái cuối, không hủy được. Lớp chặn nhầm là bảng xem trước hiện tên ngựa và mọi hệ quả, bắt buộc nhập lý do và có nhật ký.

**Lý do:**
- Ghi nhận mất kéo theo trả ô, kết thúc groom, rút lớp, hủy lịch y tế, báo chủ; đảo ngược hết là một luồng lớn cho sự cố rất hiếm.
- Ghi nhầm cả con ngựa thì xử lý thủ công theo nhật ký thao tác.

### 6. CM có dùng chức năng xóa hồ sơ để xóa phí của ngựa thật không? (B9)

**Trả lời:** Không. Xóa chỉ dành cho hồ sơ tạo nhầm chưa phát sinh nghiệp vụ. Ngựa đã có chuồng, groom, checklist, buổi khám, việc chăm sóc riêng hay phụ phí thì hệ thống chặn (409), nên không thể dùng xóa để né phí.

**Lý do:**
- Ngựa thật ở CLB gần như ngay lập tức có dữ liệu nghiệp vụ (xếp ô, giao groom, checklist sinh mỗi ngày).
- Ngựa tạo nhầm không có thật nên không ai phải trả phí; xóa xong báo cáo không tính là đúng.
- Xóa phải là CLUB MANAGER, bắt buộc lý do, có nhật ký và khôi phục được.

### 7. Route nhận số đo nhịp tim, tốc độ để public có nguy hiểm không? (D5)

**Trả lời:** Cố ý để public cho demo bằng script giả lập, vì không có thiết bị đo thật. Khi đưa vào dùng thật thì khóa bằng API key của thiết bị.

**Rủi ro đã biết:** ai có mã lượt đang tập là gửi được số đo giả.

### 11. Sao HT khu khác cũng xem được dữ liệu tập của ngựa không thuộc mình? (F2-3)

**Trả lời:** Đề bài ghi HT "xem bảng tiến độ và biểu đồ thể lực tổng quan của toàn bộ chiến mã trong câu lạc bộ". Hệ thống cho mọi HT xem dữ liệu từng lượt tập của mọi ngựa (kết quả chạy thử, nhịp tim, tốc độ, đánh giá), nhưng chỉ HT phụ trách lớp mới được ghi, sửa kết quả của lượt đó.

**Lý do:**
- HT cần so ngựa giữa các khu để chọn ngựa đi giải, và HT nhận ngựa từ khu khác cần lịch sử tập để lên giáo án tiếp.
- Tiền lệ: Hong Kong Jockey Club (một CLB, nhiều trainer cạnh tranh nhau) công khai lịch sử tập luyện, kết quả chạy thử và hồ sơ thú y của từng ngựa.
- Thứ cần bảo vệ là quyền ghi: chấm điểm, sửa kết quả, điều khiển lượt tập. Lớp, buổi, giáo án vẫn chỉ HT phụ trách lớp xem.
