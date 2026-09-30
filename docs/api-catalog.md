# API endpoint catalog

Generated from NestJS controller metadata. 178 REST operations are registered under `/api/v1`.

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
| GET | `/api/v1/horses/{horseId}/pedigree` | Get horse pedigree: parents and grandparents |
| GET | `/api/v1/horses/{horseId}/permissions` | Get what the current user can do on this horse profile |
| GET | `/api/v1/horses/{horseId}/photo-url` | Get a time-limited download URL of the horse photo |
| PUT | `/api/v1/horses/{horseId}/placement` | Place a horse in a stall and assign its groom in one step |
| POST | `/api/v1/horses/{horseId}/restore` | Restore a soft-deleted horse profile |
| GET | `/api/v1/owners/me/horses` | List horses owned by the current user |

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
| PATCH | `/api/v1/care-schedules/{id}` | Reschedule or reassign a care schedule (F3.11) |
| POST | `/api/v1/care-schedules/{id}/cancel` | Cancel a care schedule with a reason (F3.11) |
| POST | `/api/v1/care-schedules/{id}/complete` | Complete a care schedule (F3.11) |
| GET | `/api/v1/exam-requests` | Exam request queue (F3.4) |
| PATCH | `/api/v1/exam-requests/{id}` | Change the urgency of a pending exam request (F3.4) |
| POST | `/api/v1/exam-requests/{id}/dismiss` | Dismiss an exam request with a reason (F3.4) |
| GET | `/api/v1/horses/{horseId}/care-schedules` | List vaccination, deworming and farrier schedules (F3.11) |
| POST | `/api/v1/horses/{horseId}/care-schedules` | Create a care schedule (F3.11) |
| PUT | `/api/v1/horses/{horseId}/checkup-appointment` | Set or reschedule the routine checkup appointment (F3.2) |
| GET | `/api/v1/horses/{horseId}/exam-requests` | List exam requests of a horse (F3.4) |
| POST | `/api/v1/horses/{horseId}/exam-requests` | Request a medical exam for a horse (F3.4) |
| GET | `/api/v1/horses/{horseId}/health-history` | Horse health status history (F3.10) |
| PATCH | `/api/v1/horses/{horseId}/health-status` | Change horse health status with a reason (F3.7) |
| GET | `/api/v1/horses/{horseId}/injuries` | List horse injury timeline |
| GET | `/api/v1/horses/{horseId}/medical-cases` | List horse medical cases (F3.10) |
| GET | `/api/v1/horses/{horseId}/medical-records` | List horse medical visits |
| POST | `/api/v1/horses/{horseId}/medical-records` | Record a medical visit outside a case (F3.3) |
| GET | `/api/v1/horses/{horseId}/training-locks` | List current and past training locks of a horse (F3.10) |
| POST | `/api/v1/horses/{horseId}/training-locks` | Set a veterinary training lock (F3.8) |
| GET | `/api/v1/medical-cases/{caseId}` | Get a medical case with its visits (F3.10) |
| POST | `/api/v1/medical-cases/{caseId}/close` | Close a case with final conclusion and total cost (F3.9) |
| GET | `/api/v1/medical-cases/{caseId}/close-preview` | Preview what must be handled before closing a case (F3.9) |
| PATCH | `/api/v1/medical-cases/{caseId}/cost` | Adjust the cost of a closed case with a reason (F3.9) |
| POST | `/api/v1/medical-cases/{caseId}/visits` | Record a follow-up visit in an open case (F3.6) |
| GET | `/api/v1/medical-records/{id}` | Get a medical visit |
| POST | `/api/v1/medical-records/{id}/void` | Void a wrongly recorded medical visit (F3.6) |
| GET | `/api/v1/medical/checkups` | Routine checkup schedule of the herd (F3.2) |
| GET | `/api/v1/medical/cost-report` | Medical cost report by closing date (F3.10) |
| GET | `/api/v1/medical/dashboard` | Medical dashboard (F3.1) |
| GET | `/api/v1/training-locks/{id}` | Get a training lock |
| POST | `/api/v1/training-locks/{id}/release` | Release a training lock with a reason (F3.8) |

## notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/notifications` | List current user notifications |
| GET | `/api/v1/notifications/{id}` | Get current-user notification |
| PATCH | `/api/v1/notifications/{id}/read` | Mark notification as read |
| PATCH | `/api/v1/notifications/read-all` | Mark all current-user notifications as read |
| GET | `/api/v1/notifications/unread-count` | Count unread current-user notifications |

## performance

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses/{id}/alerts` | List horse performance alerts |
| GET | `/api/v1/horses/{id}/performance` | Get horse performance summary |
| GET | `/api/v1/horses/{id}/performance/sessions` | List per-session performance summary of a horse |
| GET | `/api/v1/horses/{id}/thresholds` | List current and historical threshold profiles |
| PUT | `/api/v1/horses/{id}/thresholds` | Create new version of horse threshold profile |
| GET | `/api/v1/horses/{id}/workload` | Get configured training workload summary |
| GET | `/api/v1/session-participants/{id}/evaluation` |  |
| POST | `/api/v1/session-participants/{id}/evaluation` |  |
| GET | `/api/v1/session-participants/{id}/metrics` | List participant metrics |
| POST | `/api/v1/session-participants/{id}/metrics` | Ingest participant metric |
| POST | `/api/v1/session-participants/{id}/metrics/batch` | Ingest metric batch for active participant |
| GET | `/api/v1/session-participants/{id}/performance-summary` | Get session metric and alert summary |

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
| PATCH | `/api/v1/barns/{id}` | Rename barn or assign its head trainer |
| PATCH | `/api/v1/checklists/{id}/complete` | Complete assigned checklist item |
| POST | `/api/v1/feeding-plans/{id}/approve` | Approve feeding plan as Trainer or Vet |
| GET | `/api/v1/grooms/me/today` | Get today assigned groom checklist |
| GET | `/api/v1/grooms/workload` | List active grooms with the number of horses each one cares for |
| GET | `/api/v1/horses/{horseId}/checklists` | List horse daily checklists |
| POST | `/api/v1/horses/{horseId}/checklists` | Create assigned daily checklist |
| GET | `/api/v1/horses/{horseId}/feeding-plans` | List horse feeding plans |
| POST | `/api/v1/horses/{horseId}/feeding-plans` | Create feeding plan for approval |
| PUT | `/api/v1/horses/{id}/groom` | Assign or change the groom of a horse |
| GET | `/api/v1/horses/{id}/grooms` | List the groom history of a horse |
| DELETE | `/api/v1/horses/{id}/stall` | Remove a horse from its current stall |
| PUT | `/api/v1/horses/{id}/stall` | Assign or move a horse to a stall in its barn |
| GET | `/api/v1/incidents` | List stable incidents |
| POST | `/api/v1/incidents` | Report stable incident |
| GET | `/api/v1/incidents/{id}` | Get stable incident |
| PATCH | `/api/v1/incidents/{id}/status` | Update incident resolution status |
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
| GET | `/api/v1/supplies/items` | List club supply inventory |
| POST | `/api/v1/supplies/items` | Create supply item |
| DELETE | `/api/v1/supplies/items/{id}` | Soft-delete supply item |
| GET | `/api/v1/supplies/items/{id}` | Get supply item |
| PATCH | `/api/v1/supplies/items/{id}` | Update supply quantity or threshold |
| GET | `/api/v1/supplies/items/low-stock` | List items at or below reorder threshold |
| GET | `/api/v1/supplies/requests` | List supply requests |
| POST | `/api/v1/supplies/requests` | Request supply replenishment |
| GET | `/api/v1/supplies/requests/{id}` | Get supply request |
| PATCH | `/api/v1/supplies/requests/{id}` | Update a pending supply request |
| PATCH | `/api/v1/supplies/requests/{id}/status` | Approve, reject or fulfill supply request |

## training

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/classes` |  |
| POST | `/api/v1/classes` |  |
| GET | `/api/v1/classes/{classId}` |  |
| PATCH | `/api/v1/classes/{classId}` |  |
| GET | `/api/v1/classes/{classId}/enrollments` |  |
| POST | `/api/v1/classes/{classId}/enrollments` |  |
| PATCH | `/api/v1/classes/{classId}/status` |  |
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
| GET | `/api/v1/time-trials/{id}` |  |
| GET | `/api/v1/training-classes/{classId}/plans` |  |
| POST | `/api/v1/training-classes/{classId}/plans` |  |
| GET | `/api/v1/training-plans/{id}` |  |
| PATCH | `/api/v1/training-plans/{id}` |  |
| POST | `/api/v1/training-plans/{id}/activate` |  |
| POST | `/api/v1/training-plans/{id}/cancel` |  |
| POST | `/api/v1/training-plans/{id}/complete` |  |
| GET | `/api/v1/training-plans/{id}/sessions` |  |
| POST | `/api/v1/training-plans/{id}/sessions` |  |
| GET | `/api/v1/training-sessions/{id}/time-trial` |  |
| POST | `/api/v1/training-sessions/{id}/time-trial` |  |
| GET | `/api/v1/training-sessions/{sessionId}` |  |
| PATCH | `/api/v1/training-sessions/{sessionId}` |  |
| POST | `/api/v1/training-sessions/{sessionId}/cancel` |  |
| GET | `/api/v1/training-sessions/{sessionId}/participants` |  |
| POST | `/api/v1/training-sessions/{sessionId}/publish` |  |

## users

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/users` | List club users |
| POST | `/api/v1/users` | Create club user |
| GET | `/api/v1/users/{id}` | Get club user |
| PATCH | `/api/v1/users/{id}` | Update club user |
| PATCH | `/api/v1/users/{id}/status` | Change user account status |

