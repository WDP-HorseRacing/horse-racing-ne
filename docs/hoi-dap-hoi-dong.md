# Hỏi đáp chuẩn bị bảo vệ

Cập nhật: 23/10/2026

Các câu hội đồng có thể hỏi về những quyết định nghiệp vụ "cố ý không làm" hoặc "chọn cách đơn giản", kèm câu trả lời ngắn và lý do. Mã trong ngoặc là mã mục trong bản rà nghiệp vụ.

## Nguyên tắc chung: thời điểm trên hệ thống là thời điểm ghi nhận

Áp cho ngày mất, giờ khám, lịch tập, chuyển chủ và số đo. Hệ thống không cho nhập lùi ngày giờ.

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

### 27. Ngựa đo thân nhiệt lúc 6h mà 9h mới nhập thì sao? Nhập sai thì sửa thế nào? (F1-8)

**Trả lời:** Bản ghi mang giờ nhập 9h, cùng nguyên tắc với giờ khám. Người đo nhập ngay khi đo; nhập sai thì xóa bản ghi kèm lý do (ghi nhật ký) rồi nhập lại.

**Lý do:**
- Cảnh báo sốt gửi thông báo khẩn ngay lúc lưu. Cho nhập lùi thì số đo của cơn sốt đã qua vẫn bắn "KHẨN ... Cần kiểm tra ngay" cho bác sĩ, HT, chủ ngựa.
- Không có đường sửa số đo để giữ dữ liệu trung thực: mọi thay đổi đều là xóa có lý do và bản ghi mới.

**Đánh đổi đã biết:** giờ trên biểu đồ lệch vài giờ so với lúc đo thật nếu nhập trễ. Thông báo khẩn đã gửi từ bản ghi nhập sai không thu hồi được; xóa bản ghi không xóa thông báo.

## Giới hạn nhập liệu

Nguyên tắc chung: hệ thống chặn những giá trị làm hỏng dữ liệu hoặc làm API lỗi (vd số vượt kiểu cột trả 400 thay vì lỗi máy chủ). Giá trị hợp lệ về kiểu nhưng sai về nghiệp vụ do người nhập gõ nhầm thì không đặt trần tùy ý; người nhập sửa lại, mọi lần sửa đều có nhật ký.

### 28. Lịch chăm sóc đặt hạn năm 9999 thì sao không chặn? (NEW-2)

**Trả lời:** Hạn quá xa chỉ làm lịch đó không bao giờ tới hạn, không ảnh hưởng ngựa khác hay phần khác của hệ thống. Lịch vẫn hiện trong danh sách, người lập thấy và sửa hạn hoặc hủy lịch (có nhật ký). Một con số trần (1 năm, 2 năm) là tùy ý: lịch tiêm nhắc lại hay làm móng có thể đặt xa, chặn cứng dễ chặn nhầm ca hợp lệ.

**Đánh đổi đã biết:** gõ nhầm năm thì lịch không nhắc cho tới khi có người phát hiện và sửa.

### 29. Đơn thuốc nhập ngày bắt đầu năm 2019 hay 2099 vẫn được? (F3-17)

**Trả lời:** Hệ thống chỉ chặn ngày kết thúc sớm hơn ngày bắt đầu, tức chặn đơn vô nghĩa. Ngày bắt đầu là bác sĩ chịu trách nhiệm chuyên môn: đơn có thể bắt đầu sau khám vài ngày (chờ hết thuốc cũ) hoặc ghi bù đơn đã cho trước đó. Khoảng cho phép cố định (vd từ 7 ngày trước đến 30 ngày sau ngày khám) là tùy ý. Gõ nhầm thì bác sĩ sửa buổi khám, thay lại đơn thuốc, có nhật ký.

**Đánh đổi đã biết:** đơn gõ nhầm năm hiển thị sai khoảng ngày dùng thuốc cho tới khi được sửa.

### 30. Báo cáo chọn kỳ từ năm 2020 tới nay có làm treo hệ thống? (F4-20)

**Trả lời:** Báo cáo chỉ dành cho Club Manager và chủ ngựa, họ tự chọn khoảng ngày theo nhu cầu (thường theo tháng, quý, năm). Kỳ dài thì báo cáo chạy lâu hơn nhưng chỉ người xem phải chờ; dữ liệu không bị ảnh hưởng. Không đặt trần độ dài để không chặn nhu cầu xem nhiều năm.

**Đánh đổi đã biết:** kỳ rất dài với dữ liệu lớn có thể chậm; hướng cải thiện là tối ưu câu truy vấn, không phải cấm kỳ dài.

### 31. Nhập kho nhiều lần liệu số tồn có vượt sức chứa của cột? (F4-11)

**Trả lời:** Cột tồn chứa tới khoảng 10 tỷ đơn vị, mỗi lần nhập tối đa 1 tỷ. Muốn chạm trần phải nhập khoảng 10 lần mức tối đa cho cùng một vật tư, không có kho câu lạc bộ nào như vậy. Không thêm bước kiểm tổng tồn cho một tình huống không xảy ra trong thực tế.

**Đánh đổi đã biết:** nếu cố tình nhập số khổng lồ nhiều lần, lần vượt trần nhận lỗi máy chủ thay vì câu báo nghiệp vụ; không mất hay sai dữ liệu vì giao dịch bị hủy.

## Thông báo

### 32. Yêu cầu khám mức Bình thường sao không báo bác sĩ? (F3-14)

**Trả lời:** Yêu cầu Khẩn báo ngay mọi bác sĩ. Yêu cầu Bình thường nằm trong danh sách chờ trên dashboard y tế, bác sĩ mở mỗi ngày để xếp việc. Báo từng yêu cầu thường cho mọi bác sĩ sinh nhiều thông báo, dễ làm bác sĩ bỏ qua cả thông báo khẩn.

**Đánh đổi đã biết:** yêu cầu gửi lúc bác sĩ không mở dashboard (cuối tuần) chờ tới lần mở sau; việc gấp thì chọn mức Khẩn.

### 33. Đề xuất vật tư chờ lâu sao không nhắc CM? (F4-12)

**Trả lời:** CM nhận thông báo lúc đề xuất được tạo, và danh sách đề xuất chờ duyệt luôn hiện ở màn quản lý vật tư. Người gửi được báo khi đề xuất được duyệt hoặc từ chối, nên biết đề xuất còn đang chờ.

**Đánh đổi đã biết:** không có nhắc lại tự động; CM bỏ sót thì người gửi nhắc trực tiếp.

### 34. Thông báo "bị khóa tập" có thể hiện mới hơn "đã gỡ khóa"? (OB-6)

**Trả lời:** Có thể, trong một ca hiếm: lần gửi thông báo khóa tập bị lỗi và được thử lại sau khi đã gỡ khóa, vì thông báo mang giờ gửi được thay vì giờ xảy ra. Trạng thái khóa thật luôn đúng trên hồ sơ ngựa và ở bước xếp lượt tập, nên không xếp sai được; thông báo chỉ là lời nhắc.

**Đánh đổi đã biết:** cách sửa (thông báo mang giờ xảy ra của sự việc) đã ghi ở nợ kỹ thuật thông báo, làm khi cần.

## Quyền xem thông tin sở hữu

### 35. Groom, HT, bác sĩ xem được lý do chuyển chủ (số hợp đồng, ngày ký) có lộ thông tin giao dịch không? (F1-15)

**Trả lời:** Ô lý do chỉ ghi lý do, số hợp đồng hoặc ngày ký để tra cứu, không ghi giá hay điều khoản. Nhân viên chuồng cần biết ngựa đang thuộc ai, từ ngày nào (để báo đúng chủ, tính đúng phí); số hợp đồng đi kèm không gây hại. Chủ ngựa chỉ thấy các giai đoạn của chính mình.

**Đánh đổi đã biết:** nếu CM ghi thông tin nhạy cảm vào ô lý do thì mọi vai trò xem ngựa đều thấy; quy ước nhập là không ghi giá.

### 36. Chủ cũ đã bán ngựa có xem lại được bệnh án, lịch tập trong thời gian mình sở hữu không? (F1-16)

**Trả lời:** Chủ cũ (bán ra ngoài hoặc chuyển cho chủ khác trong câu lạc bộ) xem được danh sách ngựa từng sở hữu và hồ sơ cơ bản: tên, ảnh, giới tính, ngày sinh, màu lông, phả hệ, các khoảng thời gian đã sở hữu. Bệnh án và lượt tập thuộc về con ngựa và chủ hiện tại, nên chủ cũ không xem trực tiếp. Các khoản chi phí trong thời gian sở hữu vẫn nằm trong báo cáo chi phí của chủ cũ; có thắc mắc thì Club Manager tra và cung cấp.

**Đánh đổi đã biết:** chủ cũ muốn xem chi tiết một lần khám phải hỏi Club Manager.

## Phân công Groom

### 37. Groom vắng đột xuất giữa buổi tập, sao không cho đổi hay giao Groom ngay lúc đó? Ngựa chưa có Groom cũng phải chờ? (F1-18)

**Trả lời:** Khi ngựa đang ở buổi tập (đã điểm danh, đã sẵn sàng hoặc đang chạy), hệ thống không đổi người phụ trách ngựa, kể cả giao Groom lần đầu; hết buổi thì đổi bình thường. Cùng nguyên tắc với đổi khu.

**Lý do:**
- Trách nhiệm rõ ràng: lượt tập nào đã điểm danh thì người đó dắt tới cuối, nhật ký không có lượt "nửa đầu người này, nửa sau người kia".
- Bàn giao ngựa diễn ra ở chuồng: Groom mới nhận ngựa, xem tình trạng và đồ dùng tại chuồng, không nhận giữa sân tập.
- Không có ca bế tắc: lượt đang dở do Head Trainer của lớp tự thao tác (điểm danh, sẵn sàng, bắt đầu), hoặc HT giao riêng lượt đó cho một Groom dắt hộ. Thời gian chờ tối đa là tới hết buổi.
- Những lượt chưa ai làm (chưa điểm danh, đã báo vắng nhưng buổi còn giờ, lượt sắp tới đang tạm không đủ điều kiện hoặc bị khóa tập) chuyển sang Groom mới ngay khi đổi, nên Groom mới không bị sót việc. Lượt đã xong giữ tên người đã làm.

**Đánh đổi đã biết:** CM phải đợi hết buổi mới đổi được người phụ trách; trong lúc đó HT lo lượt đang dở.

## Khóa huấn luyện

### 38. Ngựa hồi phục chậm hơn dự kiến, bác sĩ dời ngày gỡ khóa tập thế nào? (F3-8)

**Trả lời:** Bác sĩ gỡ khóa hiện tại rồi đặt khóa mới với ngày gỡ dự kiến mới; khi đóng bệnh án mà chọn giữ khóa thì nhập luôn ngày mới. Mỗi lần đặt, gỡ đều ghi nhật ký người làm, thời điểm, lý do, và báo HT, CM, chủ ngựa, Groom. Ngày gỡ chỉ là dự kiến, ngựa chỉ tập lại khi bác sĩ gỡ khóa, nên không có trường hợp ngựa tự được tập khi chưa hồi phục.

**Đánh đổi đã biết:** dời ngày bằng cách gỡ rồi đặt lại sinh hai thông báo (đã gỡ, rồi bị khóa) và lịch sử khóa thành hai dòng.

## Lớp huấn luyện

### 40. Sao HT không hẹn trước được ngày ngựa rời lớp, hay ghi ngựa đã rời lớp từ tuần trước? (F2-7)

**Trả lời:** Rời lớp tính tại lúc HT bấm: ghi danh thành Rời lớp, các lượt tập từ lúc đó trở đi bị hủy, lớp nhả chỗ ngay. Muốn ngựa rời từ ngày 30 thì ngày 30 HT bấm. Cùng nguyên tắc "thời điểm trên hệ thống là thời điểm ghi nhận" như số đo, giờ khám, ngày mất.

**Lý do:**
- Hẹn trước cho đúng phải có thêm trạng thái "sắp rời" và job chạy theo ngày: trong lúc chờ ngựa vẫn chiếm chỗ, vẫn có lượt tập, tới ngày mới nhả chỗ. Nhận ngày tương lai mà nhả chỗ ngay thì lớp vượt sức chứa trong lúc ngựa còn tập. Với quy mô câu lạc bộ, bấm đúng ngày đơn giản và không sai số liệu.
- Ghi lùi là sửa lịch sử: các lượt đã diễn ra sẽ thành lượt của ngựa "đã rời lớp", sĩ số và báo cáo các ngày đó đổi theo.

**Đánh đổi đã biết:** HT phải nhớ ngày để bấm; không đặt lịch rời trước được.

### 41. Hủy lớp nhầm thì sao, sao không cho khôi phục hay dùng lại mã lớp? (F2-8)

**Trả lời:** Hủy lớp là thao tác cuối: buổi, lượt, ghi danh của lớp bị hủy theo, nhật ký ghi người hủy và lý do. Hủy nhầm thì HT tạo lại lớp (chọn giáo án, ngày bắt đầu, thêm buổi, ghi danh lại) với mã khác.

**Lý do:**
- Khôi phục phải mở lại từng buổi, lượt, ghi danh và kiểm lại sức chứa, trùng giờ, sức khỏe ngựa tại thời điểm mở lại; tạo lại lớp đi qua đúng các kiểm tra đó nên an toàn hơn.
- Mã lớp duy nhất trong toàn bộ lịch sử: thấy mã trong nhật ký hay báo cáo là biết chắc đó là lớp nào, không lẫn giữa lớp đã hủy và lớp tạo lại.

**Đánh đổi đã biết:** phải nhập lại lớp từ đầu và đặt mã mới; giao diện nên có hộp thoại xác nhận trước khi hủy.

### 42. Ngựa vượt ngưỡng nhịp tim 2 phút sao lịch sử cảnh báo ra hàng trăm dòng? (F2-14)

**Trả lời:** Lịch sử cảnh báo liệt kê đúng từng điểm đo vượt ngưỡng (mỗi giây một điểm), có phân trang và lọc theo mức, theo ngày. Dữ liệu đầy đủ, không mất điểm nào; gom thành "đợt" (từ giờ nào tới giờ nào, đỉnh bao nhiêu) là việc hiển thị.

**Đánh đổi đã biết:** chưa gom theo đợt ở máy chủ; số đo hiện là dữ liệu giả lập, khi có thiết bị thật sẽ gom ở truy vấn.

### 43. Chủ mới mua ngựa xem được nhận xét huấn luyện từ trước khi mua; chủ cũ thì không xem được nữa? (F2-16)

**Trả lời:** Lớp, lượt tập, nhận xét thuộc về con ngựa: người đang sở hữu xem toàn bộ lịch sử tập để biết con ngựa mình mua, giống bệnh án. Chủ cũ xem hồ sơ cơ bản của ngựa từng sở hữu và báo cáo chi phí của các khoảng mình đã sở hữu; dữ liệu tập luyện và bệnh án không còn xem.

**Đánh đổi đã biết:** chủ cũ muốn xem lại một buổi tập cũ phải hỏi Club Manager.
