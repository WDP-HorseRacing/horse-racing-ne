# Hỏi đáp chuẩn bị bảo vệ

Cập nhật: 21/10/2026

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

### 8. Sao chủ ngựa không được báo khi HT ghi nhận xét hay kết quả chạy thử mới? (F2-5)

**Trả lời:** Đề bài yêu cầu chủ "xem" nhật ký nhận xét, không yêu cầu nhận thông báo. Chủ mở tab huấn luyện là thấy ngay.

**Lý do:**
- Thông báo dành cho việc chủ cần biết ngay: khóa tập, cảnh báo CRITICAL, đổi sức khỏe, đổi vòng đời.
- Báo sau mỗi buổi tập thì chủ nhận nhiều thông báo mỗi tuần, dễ bỏ qua luôn các thông báo quan trọng.

### 9. Sao Groom đang dắt ngựa không nhận cảnh báo nhịp tim vượt ngưỡng? (F2-5)

**Trả lời:** Cảnh báo CRITICAL gửi bác sĩ, HT và chủ ngựa. Lúc chạy HT đứng ở sân và bảo Groom dừng ngựa ngay.

**Lý do:** Groom đang dắt ngựa ngoài sân không cầm điện thoại để đọc thông báo; người ra lệnh dừng là HT.

### 10. Ngựa vượt ngưỡng nhịp tim hay sốt, sao hệ thống không tự gửi yêu cầu khám cho bác sĩ? (F2-6)

**Trả lời:** Đề bài chỉ yêu cầu HT xem cảnh báo vượt ngưỡng, và đưa ca sốt vào báo cáo sự cố của Groom. Hệ thống gửi cảnh báo ngay cho bác sĩ, HT và chủ; có cần khám hay không do người có chuyên môn quyết.

**Lý do:**
- HT, CM và bác sĩ tự gửi yêu cầu khám được; Groom báo sự cố, HT chuyển bác sĩ.
- Cảnh báo dựa trên một điểm đo có thể sai (cảm biến lệch, gõ nhầm); tự sinh yêu cầu sẽ làm hàng đợi khám đầy yêu cầu giả.

### 11. Sao HT khu khác cũng xem được dữ liệu tập của ngựa không thuộc mình? (F2-3)

**Trả lời:** Đề bài ghi HT "xem bảng tiến độ và biểu đồ thể lực tổng quan của toàn bộ chiến mã trong câu lạc bộ". Hệ thống cho mọi HT xem dữ liệu từng lượt tập của mọi ngựa (kết quả chạy thử, nhịp tim, tốc độ, đánh giá), nhưng chỉ HT phụ trách lớp mới được ghi, sửa kết quả của lượt đó.

**Lý do:**
- HT cần so ngựa giữa các khu để chọn ngựa đi giải, và HT nhận ngựa từ khu khác cần lịch sử tập để lên giáo án tiếp.
- Tiền lệ: Hong Kong Jockey Club (một CLB, nhiều trainer cạnh tranh nhau) công khai lịch sử tập luyện, kết quả chạy thử và hồ sơ thú y của từng ngựa.
- Thứ cần bảo vệ là quyền ghi: chấm điểm, sửa kết quả, điều khiển lượt tập. Lớp, buổi, giáo án vẫn chỉ HT phụ trách lớp xem.

## Bệnh án: mỗi ngựa một đợt điều trị đang mở

Mỗi con ngựa có tối đa một bệnh án đang mở. Bệnh án là một đợt điều trị của con ngựa, không phải hồ sơ của từng bệnh. Vấn đề mới phát sinh trong lúc đang điều trị thì bác sĩ ghi thêm một buổi tái khám vào bệnh án đang mở.

### 12. Sao không cho mở mỗi bệnh một bệnh án như phần mềm thú y thật?

**Trả lời:** Nhóm chọn mô hình đợt điều trị: một bệnh án gom mọi vấn đề của con ngựa trong thời gian đang chữa. Mỗi buổi khám vẫn có chẩn đoán, đơn thuốc và chi phí riêng, nên vẫn truy được từng vấn đề.

**Lý do:**
- Đề bài chỉ yêu cầu ghi nhận hồ sơ khám, chẩn đoán và phác đồ, không yêu cầu tách hồ sơ theo bệnh.
- Khóa huấn luyện và trạng thái sức khỏe là của con ngựa, không phải của từng bệnh. Nhiều bệnh án cùng mở thì phải trả lời "đóng bệnh án nào thì gỡ khóa, đổi sức khỏe", dễ sinh mâu thuẫn.
- Ngựa đua thường chỉ có một vấn đề chính; vấn đề phụ (ho, xước) phát sinh trong lúc chữa thì ghi chung là tự nhiên.
- Hướng mở rộng đã rõ nếu làm sản phẩm thật: bỏ ràng buộc một bệnh án mở, vết chấn thương xét theo bệnh án của buổi phát hiện, khóa huấn luyện chỉ gỡ khi đóng bệnh án cuối cùng. Chi phí đã tính theo từng buổi khám nên không phải đổi.

### 13. Ngựa đang chữa gân chân thì bị ho, bác sĩ ghi thế nào? Yêu cầu khám gửi lúc đó đi đâu?

**Trả lời:** Yêu cầu khám vẫn gửi được như thường. Bác sĩ ghi một buổi tái khám vào bệnh án gân chân, chẩn đoán thêm phần ho và gắn yêu cầu đó vào buổi khám; yêu cầu chuyển Đã khám và người gửi được báo. Không cần khám thì bác sĩ bỏ qua yêu cầu kèm lý do.

**Lý do:** Ngựa đang có bệnh án mở thì không ghi được buổi khám lẻ ngoài bệnh án, nên mọi lần khám đều nằm trong đợt điều trị đang mở và không bị rơi ra ngoài.

### 14. Vấn đề nhỏ khỏi rồi mà vẫn phải chờ vấn đề lớn khỏi mới đóng được bệnh án?

**Trả lời:** Đúng, vì đóng bệnh án là kết thúc cả đợt điều trị của con ngựa. Vấn đề nhỏ khỏi thì bác sĩ ghi ở buổi tái khám đó (kết luận, vết chấn thương đã lành); kết luận cuối lúc đóng tóm tắt mọi vấn đề.

**Đánh đổi đã biết:** không có mốc "đóng riêng" cho từng vấn đề; muốn biết vấn đề ho khỏi khi nào thì xem buổi tái khám ghi khỏi.

### 15. Bệnh án chỉ có một chẩn đoán ban đầu, danh sách và báo cáo sức khỏe hiện "gân chân" thì vấn đề ho nằm ở đâu?

**Trả lời:** Chẩn đoán ban đầu là lý do mở đợt điều trị. Vấn đề phát sinh sau nằm trong chẩn đoán của từng buổi tái khám, xem ở diễn biến của bệnh án; kết luận cuối lúc đóng ghi đủ các vấn đề.

**Đánh đổi đã biết:** danh sách bệnh án và báo cáo sức khỏe chỉ hiện chẩn đoán ban đầu và kết luận cuối, không thống kê được số ca theo từng bệnh. Đề bài không yêu cầu thống kê theo bệnh.

### 16. Vết chấn thương chưa lành chặn đóng bệnh án; ngựa chữa viêm phổi mà còn một vết xước nhỏ thì không đóng được?

**Trả lời:** Đúng, có chủ đích: bệnh án chỉ đóng khi mọi vết chấn thương đã ghi đều được bác sĩ xác nhận lành, để không có vết nào bị bỏ quên khi kết thúc điều trị. Vết đã lành thì bác sĩ cập nhật ở buổi tái khám rồi đóng. Ngựa mất thì đóng được dù còn vết.

### 17. Bệnh án kéo dài vì vấn đề phụ thì có chặn bán ngựa lâu không?

**Trả lời:** Bán ra ngoài bị chặn khi còn bệnh án mở, vì ngựa đang điều trị thì CLB phải chữa xong hoặc chốt đợt điều trị trước khi giao. Chuyển chủ nội bộ không bị chặn: bệnh án tiếp tục, chi phí từng buổi khám tính cho người là chủ vào ngày khám.

### 18. Hai bác sĩ cùng chữa hai vấn đề trong một bệnh án thì ai đóng, tiền tách sao?

**Trả lời:** Bác sĩ nào cũng đóng được bệnh án; kết luận cuối do người đóng ghi, nên hai bác sĩ thống nhất trước khi đóng. Chi phí nằm ở từng buổi khám kèm bác sĩ ghi buổi đó, nên vẫn biết khoản nào thuộc lần khám nào.

**Đánh đổi đã biết:** hệ thống không phân công bệnh án cho riêng một bác sĩ.

### 19. Mở nhầm bệnh án thì sao?

**Trả lời:** Hủy buổi khám đã mở bệnh án thì bệnh án đó chuyển Đã hủy (mở nhầm), bác sĩ mở lại bằng buổi khám đúng. Bệnh án đã đóng thì không mở lại; vấn đề tái phát sau khi đóng thì bác sĩ khám và mở đợt điều trị mới.

## Chăm sóc chuồng

### 20. Ngựa phải nhịn ăn trước mổ thì sao không ngưng được khẩu phần? (F4-3)

**Trả lời:** Khẩu phần là chuẩn "cho ăn gì, bao nhiêu", không phải lệnh từng ngày. Ngày nhịn ăn thì Groom không tick việc Cho ăn trên checklist và ghi chú lý do, HT vẫn thấy ngựa không ăn ngày đó. Đổi hẳn chế độ ăn thì HT tạo bản mới (chép từ bản cũ rồi chỉnh) và duyệt; bản cũ tự lưu trữ, nên vẫn tra được ngựa ăn theo bản nào từng ngày.

**Đánh đổi đã biết:** trong lúc nhịn ăn, Groom vẫn thấy khẩu phần trên app; lệnh nhịn ăn do bác sĩ hoặc HT dặn trực tiếp.

### 21. Groom làm việc rồi nhưng quên tick, qua nửa đêm sao không cho tick bù? (F4-7)

**Trả lời:** Checklist là việc trong ngày. Groom có cả ngày để xác nhận; quá ngày thì checklist khóa và ghi nhận là chưa xong, đúng với việc không được xác nhận kịp. Trạng thái này không ảnh hưởng phí, báo cáo hay đánh giá nào.

**Đánh đổi đã biết:** bệnh viện cho y tá ghi bù sổ cho thuốc (ghi giờ thật, đánh dấu ghi trễ) vì luật bắt hồ sơ thuốc phải đầy đủ; checklist chuồng không có ràng buộc đó nên không làm ghi bù.

## Dữ liệu và báo cáo

### 22. Sao báo cáo phí và lịch sử sức khỏe đọc từ Audit Log mà không có bảng lịch sử riêng? (NEW-3)

**Trả lời:** Mỗi lần đổi vòng đời hay sức khỏe đều ghi một dòng nhật ký có giá trị trước và sau, trong cùng giao dịch với thao tác. Hệ thống dùng chính chuỗi nhật ký đó làm lịch sử trạng thái, nên không phải ghi cùng một sự kiện vào hai nơi. Lịch sử chủ sở hữu thì có bảng riêng (giai đoạn sở hữu) vì cần tra theo khoảng thời gian cho từng chủ.

**Lý do:**
- Mọi đường tạo ngựa, đổi vòng đời, đổi sức khỏe đều đi qua service và luôn ghi nhật ký, nên lịch sử không bị thiếu.
- Nhật ký không cho sửa hay xóa trên hệ thống, nên lịch sử không bị đổi sau khi đã ghi.

**Đánh đổi đã biết:**
- Nhật ký vừa để tra cứu trách nhiệm vừa làm dữ liệu nghiệp vụ: không được dọn bớt nhật ký của ngựa hay đổi định dạng giá trị trước/sau (ghi ở Flow 1 mục 6).
- Dữ liệu nạp thẳng vào DB mà thiếu dòng tạo hồ sơ thì báo cáo phí tính sai; seed đã ghi đủ.
- Báo cáo phí kỳ dài chậm vì phải tra nhật ký cho từng ngày.
- Hướng làm khi hệ thống lớn: tách bảng lịch sử vòng đời và lịch sử sức khỏe riêng như bảng giai đoạn sở hữu, ghi trong cùng giao dịch, rồi chuyển các chỗ đọc sang bảng mới.

## Lịch chăm sóc y tế

### 23. Sao không chặn tạo hai lịch tiêm phòng, tẩy giun hay làm móng cùng loại cho một ngựa? (B17)

**Trả lời:** Nhiều lịch cùng loại là cách dùng hợp lệ: bác sĩ lên trước nhiều đợt (tẩy giun tháng 3, 7, 11; làm móng mỗi 6 tuần), hoặc cùng loại nhưng khác việc (hai mũi vắc-xin khác nhau, cắt sửa móng và đóng móng), phân biệt bằng ghi chú của lịch. Chỉ khám định kỳ mới giới hạn một lịch chờ cho mỗi ngựa, tái khám một lịch cho mỗi buổi khám.

**Đánh đổi đã biết:** lỡ tạo trùng thì hệ thống không chặn; bác sĩ thấy hai lịch giống nhau trên dashboard y tế và hủy một lịch.

## Kho vật tư

### 24. Nâng ngưỡng tồn thấp làm vật tư rơi vào diện sắp hết mà sao không ai được báo? (B19)

**Trả lời:** Thông báo sắp hết hàng gửi cho CLUB MANAGER, và chỉ CLUB MANAGER sửa được ngưỡng; người nâng ngưỡng là người nhận thông báo nên đã biết. Thông báo chỉ phát khi lần xuất dùng làm tồn đi xuống tới ngưỡng, tức là lúc có thay đổi mà CLUB MANAGER không trực tiếp làm. Danh sách "Sắp hết" luôn tính theo ngưỡng hiện tại nên vẫn hiện vật tư đó.

**Đánh đổi đã biết:** câu lạc bộ có nhiều CLUB MANAGER thì những người còn lại không nhận thông báo khi một người nâng ngưỡng; họ thấy vật tư trong danh sách "Sắp hết".

## Hồ sơ ngựa

### 25. Thiến là không đảo ngược được, sao vẫn cho đổi giới tính từ Ngựa thiến về Ngựa đực? Và sao "thiến" lại nằm chung ô giới tính? (B21)

**Trả lời:** Cho đổi để sửa được lúc tạo hồ sơ chọn nhầm; chặn chiều này thì hồ sơ nhập nhầm không còn đường sửa. Mọi lần đổi đều ghi nhật ký người đổi, thời điểm, giá trị trước và sau. Luật cần thiết là giữ đúng phả hệ: ngựa đang là cha không đổi thành ngựa cái, ngựa đang là mẹ phải giữ ngựa cái; chọn cha chỉ nhận ngựa đực hoặc ngựa thiến (ngựa có thể đã sinh con trước khi thiến), chọn mẹ chỉ nhận ngựa cái.

Hồ sơ ngựa đua thường ghi giới tính thành một nhóm duy nhất có cả ngựa thiến (gelding), vì điều kiện và hạng mục thi đấu xét theo các nhóm này; hệ thống làm theo cách ghi đó thay vì tách giới tính và tình trạng thiến.

**Đánh đổi đã biết:** không lưu ngày thiến; đề bài không yêu cầu.

### 26. Ngựa đã chuyển nhượng hoặc đã mất gõ sai số chip, tên, ngày sinh thì sửa sao? (F1-7)

**Trả lời:** Thông tin định danh phải đúng trong suốt thời gian ngựa ở câu lạc bộ, lúc ngựa còn tập, khám, tính phí; hồ sơ đang hoạt động sửa được bình thường. Khi ngựa đã rời câu lạc bộ, hồ sơ chỉ được xem. Ngựa đã chuyển nhượng mà câu lạc bộ mua lại thì kích hoạt lại, hồ sơ sửa được như cũ. Ngựa đã mất là trạng thái cuối, không sửa (cùng nguyên tắc câu ghi nhận mất).

**Đánh đổi đã biết:** ngựa đã mất giữ số chip; nếu số chip đó bị gõ nhầm trùng với số chip thật của ngựa mới thì không tạo được hồ sơ mới, xử lý thủ công theo nhật ký.
