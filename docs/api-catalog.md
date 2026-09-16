# API endpoint catalog

Generated from NestJS controller metadata. 131 REST operations are registered under `/api/v1`.

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

## clubs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/clubs/me` | Get current club |
| PATCH | `/api/v1/clubs/me` | Update current club settings |

## health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Check API process health |

## horses

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses` | List horses visible to the current user |
| POST | `/api/v1/horses` | Create horse profile |
| GET | `/api/v1/horses/{horseId}/eligibility` | Get current training and racing eligibility |
| PATCH | `/api/v1/horses/{horseId}/health-status` | Change horse health status |
| PATCH | `/api/v1/horses/{horseId}/lifecycle-status` | Change horse lifecycle status |
| GET | `/api/v1/horses/{horseId}/measurements` | List horse measurement history |
| POST | `/api/v1/horses/{horseId}/measurements` | Record a horse measurement |
| GET | `/api/v1/horses/{horseId}/owners` | List horse ownership history |
| PUT | `/api/v1/horses/{horseId}/owners` | Replace active ownership shares |
| GET | `/api/v1/horses/{horseId}/pedigree` | Get horse pedigree up to 4 generations |
| DELETE | `/api/v1/horses/{id}` | Soft-delete a horse profile created by mistake |
| GET | `/api/v1/horses/{id}` | Get horse profile detail |
| PATCH | `/api/v1/horses/{id}` | Update horse profile and pedigree parents |
| GET | `/api/v1/owners/me/horses` | List horses currently owned by the current user |

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
| PATCH | `/api/v1/care-schedules/{id}` | Update veterinary care schedule |
| POST | `/api/v1/care-schedules/{id}/complete` | Complete veterinary care item |
| GET | `/api/v1/horses/{horseId}/care-schedules` | List vaccination, deworming and farrier schedule |
| POST | `/api/v1/horses/{horseId}/care-schedules` | Schedule veterinary care |
| GET | `/api/v1/horses/{horseId}/injuries` | List horse injury timeline |
| GET | `/api/v1/horses/{horseId}/medical-records` | List horse medical records |
| POST | `/api/v1/horses/{horseId}/medical-records` | Create append-only medical record |
| GET | `/api/v1/horses/{horseId}/training-locks` | List horse training lock history |
| POST | `/api/v1/horses/{horseId}/training-locks` | Create veterinary training lock |
| POST | `/api/v1/injury-cases/{id}/recovery-events` | Append injury recovery event |
| GET | `/api/v1/injury-cases/{id}/timeline` | Get append-only injury recovery timeline |
| GET | `/api/v1/medical-records/{id}` | Get medical record |
| POST | `/api/v1/medical-records/{id}/injuries` | Add injury marker to medical record |
| POST | `/api/v1/medical-records/{id}/prescriptions` | Add prescription to medical record |
| POST | `/api/v1/medical-records/{id}/void` | Void medical record with reason |
| GET | `/api/v1/training-locks/{id}` | Get training lock details |
| PATCH | `/api/v1/training-locks/{id}` | Update active veterinary training lock |
| POST | `/api/v1/training-locks/{id}/release` | Release veterinary training lock |

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
| GET | `/api/v1/horses/{id}/thresholds` | List current and historical threshold profiles |
| PUT | `/api/v1/horses/{id}/thresholds` | Create new version of horse threshold profile |
| GET | `/api/v1/horses/{id}/workload` | Get configured training workload summary |
| GET | `/api/v1/sessions/{id}/metrics` | List session metrics |
| POST | `/api/v1/sessions/{id}/metrics` | Ingest session metric |
| POST | `/api/v1/sessions/{id}/metrics/batch` | Ingest metric batch for active session |
| GET | `/api/v1/sessions/{id}/performance-summary` | Get session metric and alert summary |

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
| PATCH | `/api/v1/checklists/{id}/complete` | Complete assigned checklist item |
| POST | `/api/v1/feeding-plans/{id}/approve` | Approve feeding plan as Trainer or Vet |
| GET | `/api/v1/grooms/me/today` | Get today assigned groom checklist |
| GET | `/api/v1/horses/{horseId}/checklists` | List horse daily checklists |
| POST | `/api/v1/horses/{horseId}/checklists` | Create assigned daily checklist |
| GET | `/api/v1/horses/{horseId}/feeding-plans` | List horse feeding plans |
| POST | `/api/v1/horses/{horseId}/feeding-plans` | Create feeding plan for approval |
| GET | `/api/v1/incidents` | List stable incidents |
| POST | `/api/v1/incidents` | Report stable incident |
| GET | `/api/v1/incidents/{id}` | Get stable incident |
| PATCH | `/api/v1/incidents/{id}/status` | Update incident resolution status |
| POST | `/api/v1/stable-assignments/{id}/end` | End stable assignment |
| GET | `/api/v1/stalls` | List club stalls |
| POST | `/api/v1/stalls` | Create stall |
| DELETE | `/api/v1/stalls/{id}` | Soft-delete stall |
| GET | `/api/v1/stalls/{id}` | Get stall |
| PATCH | `/api/v1/stalls/{id}` | Update stall |
| GET | `/api/v1/stalls/{id}/assignments` | List stall assignment history |
| POST | `/api/v1/stalls/{id}/assignments` | Assign horse and groom to stall |

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
| PATCH | `/api/v1/supplies/requests/{id}/status` | Approve, reject or fulfill supply request |

## training

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/horses/{horseId}/training-plans` | List horse training plans |
| POST | `/api/v1/horses/{horseId}/training-plans` | Create training plan |
| GET | `/api/v1/sessions/{id}` | Get training session |
| PATCH | `/api/v1/sessions/{id}` | Reschedule or reassign training session |
| POST | `/api/v1/sessions/{id}/cancel` | Cancel training session |
| POST | `/api/v1/sessions/{id}/complete` | Complete training session |
| GET | `/api/v1/sessions/{id}/evaluation` | Get session evaluation |
| POST | `/api/v1/sessions/{id}/evaluation` | Evaluate completed session |
| POST | `/api/v1/sessions/{id}/start` | Start training session |
| GET | `/api/v1/sessions/{id}/time-trials` | List session time trials |
| POST | `/api/v1/sessions/{id}/time-trials` | Record session time trial |
| GET | `/api/v1/time-trials/{id}` | Get time trial result and media |
| GET | `/api/v1/training-plans/{id}` | Get training plan |
| PATCH | `/api/v1/training-plans/{id}` | Update training plan |
| POST | `/api/v1/training-plans/{id}/activate` | Activate training plan |
| POST | `/api/v1/training-plans/{id}/cancel` | Cancel training plan |
| GET | `/api/v1/training-plans/{id}/sessions` | List sessions in training plan |
| POST | `/api/v1/training-plans/{id}/sessions` | Schedule training session |

## users

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/users` | List club users |
| POST | `/api/v1/users` | Create club user |
| GET | `/api/v1/users/{id}` | Get club user |
| PATCH | `/api/v1/users/{id}` | Update club user |
| PATCH | `/api/v1/users/{id}/status` | Change user account status |

