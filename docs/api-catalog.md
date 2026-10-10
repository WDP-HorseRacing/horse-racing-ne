# API endpoint catalog

Generated from NestJS controller metadata. 202 REST operations are registered under `/api/v1`.

The health operation is functional. Every other operation is a contract-only route that returns HTTP 501 until authentication, authorization and its service are implemented. Request DTOs and operation details are available in Swagger at `/docs` when the API is running.

Socket.IO uses the `/events` namespace. Its gateway currently rejects connections until JWT handshake authorization and room policies are implemented. Refresh sessions, audit writes, and domain events are internal operations rather than public REST endpoints.

## audit

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/audit-logs` | List club audit records |
| GET | `/api/v1/audit-logs/{id}` | Get club audit record |

## auth

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/change-password` | Change current account password |
| POST | `/api/v1/auth/login` | Sign in with club account |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/auth/me` | Get current account and role |
| GET | `/api/v1/auth/oidc/{provider}` | Bat dau luong dang nhap qua identity provider |
| GET | `/api/v1/auth/oidc/{provider}/callback` | Diem identity provider redirect ve |
| POST | `/api/v1/auth/refresh` | Exchange refresh token |

## health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Check API process health |

## horses

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses` | List horses visible to the current user |
| POST | `/api/v1/horses` | Create horse profile |
| DELETE | `/api/v1/horses/{horseId}` | Soft-delete a horse profile created by mistake |
| GET | `/api/v1/horses/{horseId}` | Get horse profile detail |
| PATCH | `/api/v1/horses/{horseId}` | Update horse profile, parents and owner |
| PUT | `/api/v1/horses/{horseId}/barn` | Assign or change the barn of a horse |
| GET | `/api/v1/horses/{horseId}/barn-preview` | Preview the consequences of changing the barn of a horse |
| GET | `/api/v1/horses/{horseId}/deletion-preview` | Preview whether a horse profile can be deleted |
| GET | `/api/v1/horses/{horseId}/eligibility` | Get current training and racing eligibility |
| PATCH | `/api/v1/horses/{horseId}/lifecycle-status` | Change horse lifecycle status |
| GET | `/api/v1/horses/{horseId}/lifecycle-status/preview` | Preview the consequences of a lifecycle change |
| GET | `/api/v1/horses/{horseId}/measurements` | List horse measurement history |
| POST | `/api/v1/horses/{horseId}/measurements` | Record one measuring session of a horse |
| DELETE | `/api/v1/horses/{horseId}/measurements/{measurementId}` | Soft-delete a wrong horse measurement |
| POST | `/api/v1/horses/{horseId}/ownership-transfers` | Transfer the horse to another owner in the club |
| GET | `/api/v1/horses/{horseId}/ownerships` | List the ownership history of a horse |
| GET | `/api/v1/horses/{horseId}/pedigree` | Get horse pedigree: parents and grandparents |
| GET | `/api/v1/horses/{horseId}/permissions` | Get what the current user can do on this horse profile |
| GET | `/api/v1/horses/{horseId}/photo-url` | Get a time-limited download URL of the horse photo |
| PUT | `/api/v1/horses/{horseId}/placement` | Place a horse in a stall and assign its groom in one step |
| POST | `/api/v1/horses/{horseId}/restore` | Restore a soft-deleted horse profile |
| GET | `/api/v1/horses/{horseId}/restore-preview` | Preview the consequences of restoring a deleted horse profile |

## media

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/media/{id}` | Get media metadata |
| POST | `/api/v1/media/{id}/complete` | Confirm completed object upload |
| GET | `/api/v1/media/{id}/download-url` | Request time-limited private download URL |
| POST | `/api/v1/media/upload-requests` | Request time-limited private upload URL |

## medical

| Method | Path | Purpose |
| --- | --- | --- |
| PATCH | `/api/v1/care-schedules/{id}` | Reschedule or reassign a care schedule |
| POST | `/api/v1/care-schedules/{id}/cancel` | Cancel a care schedule with a reason |
| POST | `/api/v1/care-schedules/{id}/complete` | Complete a care schedule |
| GET | `/api/v1/exam-requests` | Exam request queue |
| PATCH | `/api/v1/exam-requests/{id}` | Change the urgency of a pending exam request |
| POST | `/api/v1/exam-requests/{id}/dismiss` | Dismiss an exam request with a reason |
| GET | `/api/v1/horses/{horseId}/care-instructions` | Get the current care instructions of a horse |
| GET | `/api/v1/horses/{horseId}/care-schedules` | List vaccination, deworming and farrier schedules |
| POST | `/api/v1/horses/{horseId}/care-schedules` | Create a care schedule |
| PUT | `/api/v1/horses/{horseId}/checkup-appointment` | Set or reschedule the routine checkup appointment |
| GET | `/api/v1/horses/{horseId}/exam-requests` | List exam requests of a horse |
| POST | `/api/v1/horses/{horseId}/exam-requests` | Request a medical exam for a horse |
| GET | `/api/v1/horses/{horseId}/health-history` | Horse health status history |
| PATCH | `/api/v1/horses/{horseId}/health-status` | Change horse health status with a reason |
| GET | `/api/v1/horses/{horseId}/injuries` | List horse injury timeline |
| GET | `/api/v1/horses/{horseId}/medical-cases` | List horse medical cases |
| GET | `/api/v1/horses/{horseId}/medical-records` | List horse medical visits |
| POST | `/api/v1/horses/{horseId}/medical-records` | Record a medical visit outside a case |
| GET | `/api/v1/horses/{horseId}/training-locks` | List current and past training locks of a horse |
| POST | `/api/v1/horses/{horseId}/training-locks` | Set a veterinary training lock |
| GET | `/api/v1/medical-cases/{caseId}` | Get a medical case with its visits |
| POST | `/api/v1/medical-cases/{caseId}/close` | Close a case with final conclusion and total cost |
| GET | `/api/v1/medical-cases/{caseId}/close-preview` | Preview what must be handled before closing a case |
| PATCH | `/api/v1/medical-cases/{caseId}/cost` | Adjust the cost of a closed case with a reason |
| POST | `/api/v1/medical-cases/{caseId}/visits` | Record a follow-up visit in an open case |
| GET | `/api/v1/medical-records/{id}` | Get a medical visit |
| POST | `/api/v1/medical-records/{id}/void` | Void a wrongly recorded medical visit |
| GET | `/api/v1/medical/checkups` | Routine checkup schedule of the herd |
| GET | `/api/v1/medical/cost-report` | Medical cost report by closing date |
| GET | `/api/v1/medical/dashboard` | Medical dashboard |
| GET | `/api/v1/training-locks/{id}` | Get a training lock |
| POST | `/api/v1/training-locks/{id}/release` | Release a training lock with a reason |

## notifications

| Method | Path | Purpose |
| --- | --- | --- |
| PUT | `/api/v1/me/devices` | Register the current device for push notifications |
| DELETE | `/api/v1/me/devices/{token}` | Unregister a device of the current user |
| GET | `/api/v1/notifications` | List current user notifications |
| GET | `/api/v1/notifications/{id}` | Get current-user notification |
| PATCH | `/api/v1/notifications/{id}/read` | Mark notification as read |
| PATCH | `/api/v1/notifications/read-all` | Mark all current-user notifications as read |
| GET | `/api/v1/notifications/unread-count` | Count unread current-user notifications |

## performance

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses/{id}/alerts` | Lịch sử điểm đo vượt ngưỡng (WARNING, CRITICAL) của ngựa |
| GET | `/api/v1/horses/{id}/performance` | Get horse performance summary |
| GET | `/api/v1/horses/{id}/performance/sessions` | List per-session performance summary of a horse |
| GET | `/api/v1/horses/{id}/thresholds` | Xem ngưỡng nhịp tim/tốc độ đang áp và lịch sử phiên bản của ngựa |
| PUT | `/api/v1/horses/{id}/thresholds` | Tạo phiên bản ngưỡng nhịp tim/tốc độ mới cho ngựa |
| GET | `/api/v1/horses/{id}/workload` | Khối lượng tập của ngựa trong một khoảng ngày (lượt đã hoàn thành) |
| GET | `/api/v1/session-participants/{id}/evaluation` |  |
| POST | `/api/v1/session-participants/{id}/evaluation` |  |
| GET | `/api/v1/session-participants/{id}/metrics` | Xem các điểm đo nhịp tim/tốc độ của lượt tập theo thời gian |
| POST | `/api/v1/session-participants/{id}/metrics` | Nhận một điểm đo nhịp tim/tốc độ của lượt tập đang diễn ra |
| POST | `/api/v1/session-participants/{id}/metrics/batch` | Nhận một lô điểm đo nhịp tim/tốc độ của lượt tập đang diễn ra |
| GET | `/api/v1/session-participants/{id}/performance-summary` | Tổng kết nhịp tim, tốc độ và số cảnh báo của lượt tập |

## racing

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses/{horseId}/race-results` | Get horse race history |
| GET | `/api/v1/races` | List races |
| POST | `/api/v1/races` | Create race |
| GET | `/api/v1/races/{id}` | Get race and conditions |
| PATCH | `/api/v1/races/{id}` | Update race before registration closes |
| GET | `/api/v1/races/{id}/registrations` | List race registrations |
| POST | `/api/v1/races/{id}/registrations` | Register eligible horse for race |
| GET | `/api/v1/races/{id}/registrations/{registrationId}` | Get race registration and approvals |
| PATCH | `/api/v1/races/{id}/registrations/{registrationId}` | Approve or reject race registration |
| PATCH | `/api/v1/races/{id}/registrations/{registrationId}/result` | Record race result for registration |
| GET | `/api/v1/races/{id}/results` | Get race results |

## reports

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/reports/club/finance` | Get later-phase manual finance summary |
| GET | `/api/v1/reports/club/medical` | Get club medical activity report |
| GET | `/api/v1/reports/club/training` | Get club training activity report |
| GET | `/api/v1/reports/dashboard` | Get role-scoped dashboard summary |
| GET | `/api/v1/reports/horses/{horseId}/health` | Get horse health history report |
| GET | `/api/v1/reports/horses/{horseId}/progress` | Get horse training progress report |

## stable

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/barns` | List barns of the club with their head trainer |
| POST | `/api/v1/barns` | Create barn |
| DELETE | `/api/v1/barns/{id}` | Soft-delete barn |
| GET | `/api/v1/barns/{id}` | Get barn details |
| PATCH | `/api/v1/barns/{id}` | Update barn details or its head trainer |
| GET | `/api/v1/care-task-types` | Liệt kê danh mục loại việc chăm sóc |
| POST | `/api/v1/care-task-types` | Thêm loại việc chăm sóc |
| PATCH | `/api/v1/care-task-types/{id}` | Sửa, ngưng hoặc dùng lại loại việc chăm sóc |
| PATCH | `/api/v1/checklist-items/{id}` | Tick hoặc gỡ tick một việc trong checklist hôm nay |
| POST | `/api/v1/feeding-plans` | Lập bản nháp khẩu phần cho một hoặc nhiều ngựa |
| DELETE | `/api/v1/feeding-plans/{id}` | Xóa bản nháp khẩu phần |
| GET | `/api/v1/feeding-plans/{id}` | Xem một khẩu phần |
| PUT | `/api/v1/feeding-plans/{id}` | Thay toàn bộ dòng của bản nháp khẩu phần |
| POST | `/api/v1/feeding-plans/{id}/approve` | Duyệt bản nháp thành khẩu phần đang áp dụng của ngựa |
| GET | `/api/v1/grooms/me/today` | Màn Hôm nay của Groom: việc trong ngày của từng ngựa phụ trách |
| GET | `/api/v1/grooms/workload` | List active grooms with the number of horses each one cares for |
| DELETE | `/api/v1/horse-care-tasks/{id}` | Gỡ việc riêng: chưa bắt đầu thì xóa, đang chạy thì kết thúc hôm nay |
| GET | `/api/v1/horses/{horseId}/care-tasks` | Liệt kê việc riêng của ngựa |
| POST | `/api/v1/horses/{horseId}/care-tasks` | Gắn việc riêng cho ngựa trong khoảng ngày |
| GET | `/api/v1/horses/{horseId}/checklists` | Checklist hằng ngày của ngựa theo khoảng ngày |
| GET | `/api/v1/horses/{horseId}/feeding-plans` | Liệt kê khẩu phần của ngựa |
| PUT | `/api/v1/horses/{id}/groom` | Assign or change the groom of a horse |
| GET | `/api/v1/horses/{id}/grooms` | List the groom history of a horse |
| DELETE | `/api/v1/horses/{id}/stall` | Remove a horse from its current stall |
| PUT | `/api/v1/horses/{id}/stall` | Assign or move a horse to a stall in its barn |
| GET | `/api/v1/incidents` | Liệt kê sự cố tại chuồng |
| POST | `/api/v1/incidents` | Báo sự cố tại chuồng cho ngựa mình phụ trách |
| GET | `/api/v1/incidents/{id}` | Xem một sự cố kèm yêu cầu khám |
| POST | `/api/v1/incidents/{id}/refer` | Chuyển sự cố cho bác sĩ: tạo yêu cầu khám, khẩn thì báo ngay mọi bác sĩ |
| POST | `/api/v1/incidents/{id}/resolve` | Đóng sự cố kèm kết quả xử lý |
| POST | `/api/v1/stall-assignments/{id}/end` | End stall assignment |
| GET | `/api/v1/stalls` | List club stalls |
| POST | `/api/v1/stalls` | Create stall |
| DELETE | `/api/v1/stalls/{id}` | Soft-delete stall |
| GET | `/api/v1/stalls/{id}` | Get stall |
| PATCH | `/api/v1/stalls/{id}` | Update stall |
| GET | `/api/v1/stalls/{id}/assignments` | List stall assignment history |

## supplies

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/supplies/items` | Liệt kê vật tư của kho chung |
| POST | `/api/v1/supplies/items` | Thêm vật tư |
| DELETE | `/api/v1/supplies/items/{id}` | Xóa mềm vật tư |
| GET | `/api/v1/supplies/items/{id}` | Xem một vật tư |
| PATCH | `/api/v1/supplies/items/{id}` | Sửa tên, loại, đơn vị, ngưỡng báo thiếu của vật tư |
| GET | `/api/v1/supplies/items/{id}/movements` | Sổ nhập xuất của vật tư, mới nhất trước |
| POST | `/api/v1/supplies/items/{id}/stock-counts` | Kiểm kê: ghi số đếm thực tế của vật tư |
| GET | `/api/v1/supplies/items/low-stock` | Liệt kê vật tư sắp hết |
| GET | `/api/v1/supplies/requests` | Liệt kê đề xuất bổ sung vật tư |
| POST | `/api/v1/supplies/requests` | Gửi đề xuất bổ sung vật tư |
| GET | `/api/v1/supplies/requests/{id}` | Xem một đề xuất bổ sung vật tư |
| PATCH | `/api/v1/supplies/requests/{id}` | Sửa đề xuất đang chờ duyệt của mình |
| PATCH | `/api/v1/supplies/requests/{id}/status` | Duyệt, từ chối hoặc cấp đề xuất bổ sung vật tư |

## training

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/classes` |  |
| POST | `/api/v1/classes` |  |
| GET | `/api/v1/classes/{classId}` |  |
| PATCH | `/api/v1/classes/{classId}` |  |
| GET | `/api/v1/classes/{classId}/enrollments` |  |
| POST | `/api/v1/classes/{classId}/enrollments` |  |
| GET | `/api/v1/classes/{classId}/sessions` |  |
| POST | `/api/v1/classes/{classId}/sessions` |  |
| POST | `/api/v1/classes/{classId}/sessions/publish` | Publish một lần mọi buổi nháp của lớp, hoặc trong một khoảng ngày |
| PATCH | `/api/v1/classes/{classId}/status` |  |
| POST | `/api/v1/classes/schedule-preview` | Xem trước lịch buổi tập sinh từ giáo án, không lưu |
| PATCH | `/api/v1/enrollments/{id}/leave` |  |
| GET | `/api/v1/horses/{horseId}/training/classes` | List classes of a horse |
| GET | `/api/v1/horses/{horseId}/training/sessions` | List training sessions of a horse |
| POST | `/api/v1/session-participants/{id}/absent` |  |
| POST | `/api/v1/session-participants/{id}/check-in` |  |
| POST | `/api/v1/session-participants/{id}/complete` |  |
| PATCH | `/api/v1/session-participants/{id}/groom` |  |
| POST | `/api/v1/session-participants/{id}/ready` |  |
| POST | `/api/v1/session-participants/{id}/start` |  |
| GET | `/api/v1/session-participants/{id}/trial-results` |  |
| POST | `/api/v1/session-participants/{id}/trial-results` |  |
| PATCH | `/api/v1/session-participants/{id}/trial-results/{attemptNo}` | Gắn, đổi hoặc gỡ video của một lần chạy thử |
| GET | `/api/v1/time-trials/{id}` |  |
| GET | `/api/v1/training-plans` | Liệt kê giáo án (Head Trainer: của mình) |
| POST | `/api/v1/training-plans` | Tạo giáo án ghép môn theo tuần |
| DELETE | `/api/v1/training-plans/{id}` | Xóa giáo án chưa có lớp dùng |
| GET | `/api/v1/training-plans/{id}` | Xem một giáo án kèm các môn |
| PUT | `/api/v1/training-plans/{id}` | Thay nội dung giáo án của mình |
| GET | `/api/v1/training-sessions/{id}/time-trial` |  |
| PATCH | `/api/v1/training-sessions/{id}/time-trial` |  |
| POST | `/api/v1/training-sessions/{id}/time-trial` |  |
| GET | `/api/v1/training-sessions/{sessionId}` |  |
| PATCH | `/api/v1/training-sessions/{sessionId}` |  |
| POST | `/api/v1/training-sessions/{sessionId}/cancel` |  |
| GET | `/api/v1/training-sessions/{sessionId}/participants` |  |
| POST | `/api/v1/training-sessions/{sessionId}/publish` |  |
| GET | `/api/v1/training-subjects` | Liệt kê danh mục môn học |
| POST | `/api/v1/training-subjects` | Thêm môn học |
| DELETE | `/api/v1/training-subjects/{subjectId}` | Xóa môn học |
| GET | `/api/v1/training-subjects/{subjectId}` | Xem một môn học |
| PATCH | `/api/v1/training-subjects/{subjectId}` | Sửa môn học |

## users

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/users` | List club users |
| POST | `/api/v1/users` | Create club user |
| GET | `/api/v1/users/{id}` | Get club user |
| PATCH | `/api/v1/users/{id}` | Update club user |
| POST | `/api/v1/users/{id}/head-trainer-handover` | Bàn giao khu chuồng, giáo án và lớp chưa kết thúc của Head Trainer sang Head Trainer khác |
| PATCH | `/api/v1/users/{id}/status` | Change user account status |

