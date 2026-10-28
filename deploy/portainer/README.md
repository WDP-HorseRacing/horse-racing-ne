# Deploy bằng Portainer

Các file này tạo ba stack độc lập: `infra` (PostgreSQL, MongoDB, Redis, MinIO, Keycloak), `be` (NestJS API) và `caddy` (HTTPS/reverse proxy). Cả ba dùng Docker network `racehorse-net`; triển khai `infra` trước, sau đó `be`, rồi `caddy`.

## Chuẩn bị

1. Tạo `.env.production` trong từng thư mục stack từ file `.env.production.example` tương ứng, điền domain và mật khẩu thật. Các file `.env.production` được Git bỏ qua để không đưa secret lên remote.
2. Đẩy các file compose và `.env.production.example` lên Git remote mà Portainer đọc được.
3. Trỏ DNS `A` (và `AAAA` nếu VPS có IPv6) của các tên miền đến IP VPS: `horse.io.vn`, `api.horse.io.vn`, `auth.horse.io.vn`, `s3.horse.io.vn`, và một hostname riêng cho MinIO Console, ví dụ `minio.horse.io.vn`.
4. Mở cổng TCP `80` và `443`; có thể mở UDP `443` để Caddy dùng HTTP/3.
5. Trong Portainer, tạo từng stack từ **Git repository**, chọn đúng branch và đường dẫn compose bên dưới. Stack `be` chỉ tham chiếu image đã được GitHub Actions publish lên GHCR; Portainer không build image từ source.

| Stack | Đường dẫn compose |
| --- | --- |
| infra | `deploy/portainer/infra/compose.yaml` |
| be | `deploy/portainer/be/compose.yaml` |
| caddy | `deploy/portainer/caddy/compose.yaml` |

Mỗi stack dùng file `.env.production` riêng. Trên Portainer, nạp đúng file biến tương ứng bằng **Load variables from .env file** khi tạo stack. Tài liệu Portainer ghi nhận thao tác nạp file này chỉ có trong Business Edition; nếu bản bạn dùng không có nút đó, nhập các cặp tên/giá trị từ file vào **Environment variables** của stack. Biến giữa các stack không tự chia sẻ. Dùng mật khẩu dài, riêng biệt; không đưa file thật lên Git.

## Biến cần nhập

**infra** — `deploy/portainer/infra/.env.production`

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Các cổng host tùy chọn: `POSTGRES_HOST_PORT` (mặc định `15432`), `MONGO_HOST_PORT` (`27018`), `REDIS_HOST_PORT` (`6379`), `MINIO_API_HOST_PORT` (`19000`), `MINIO_CONSOLE_HOST_PORT` (`19001`), `KEYCLOAK_HOST_PORT` (`8080`). Có thể đổi nếu VPS đã dùng các cổng mặc định này.
- `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`
- `KC_DB_URL_HOST`, `KC_DB_URL_PORT`, `KC_DB_URL_DATABASE`, `KC_HTTP_ENABLED`, `KC_PROXY_HEADERS`, `KC_HEALTH_ENABLED` (Keycloak dùng chung `POSTGRES_USER` và `POSTGRES_PASSWORD`)
- `AUTH_DOMAIN` (chỉ hostname, ví dụ `auth.example.com`)
- `MINIO_CONSOLE_DOMAIN` (ví dụ `minio.example.com`)
- `CORS_ORIGINS` (origin frontend, ví dụ `https://app.example.com`; nhiều origin phân cách bằng dấu phẩy)

**be** — `deploy/portainer/be/.env.production`

- `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_NAME` (mặc định dùng `horse-postgres:5432` trong network Docker)
- `POSTGRES_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `MONGO_URI`, ví dụ `mongodb://racehorse:URL_ENCODED_PASSWORD@horse-mongo:27017/racehorse?authSource=admin`. Mã hóa ký tự đặc biệt trong mật khẩu theo URL encoding.
- `AUTH_DOMAIN`, `KEYCLOAK_REALM` (mặc định `racehorse`), `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_SECRET`
- `KEYCLOAK_REDIRECT_URI` là callback công khai của API, ví dụ `https://api.example.com/api/v1/auth/oidc/google/callback`
- `S3_DOMAIN`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`; mặc định bucket là `racehorse-media` (`S3_BUCKET` để đổi)
- `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_PRESIGNED_URL_TTL_SECONDS`
- `CORS_ORIGINS` là origin frontend, ví dụ `https://app.example.com` (nhiều origin phân cách bằng dấu phẩy)
- `AXIOS_TIMEOUT_MS`, `AXIOS_RETRY_COUNT`, `AXIOS_RETRY_BASE_DELAY_MS`, `AXIOS_RETRY_MAX_DELAY_MS`
- `BE_IMAGE` trỏ tới image trên GHCR; mặc định `ghcr.io/wdp-horseracing/horse-racing-ne:latest`. Workflow publish `latest` khi push lên `main`, cùng các tag version và commit SHA.
- Nếu package GHCR đang private, cấu hình registry credentials trong Portainer để Portainer có quyền pull image.

**caddy** — `deploy/portainer/caddy/.env.production`

- `FE_DOMAIN=horse.io.vn`, `FE_UPSTREAM` là tên service và port của frontend trong Docker network, mặc định theo stack FE hiện tại là `horse-racing-fe:80`
- `API_DOMAIN=api.horse.io.vn`, `AUTH_DOMAIN=auth.horse.io.vn`, `S3_DOMAIN=s3.horse.io.vn`
- `MINIO_CONSOLE_DOMAIN=minio.horse.io.vn` (hostname riêng cho giao diện quản trị MinIO)

Các domain chỉ ghi hostname, không thêm `https://`. Frontend cần tham gia Docker network `racehorse-net`; stack FE hiện tại đã khai báo alias `horse-racing-fe` và port nội bộ `80`. Caddy không khởi chạy frontend. Nếu tên service hoặc port thay đổi, cập nhật `FE_UPSTREAM` theo giá trị thực tế.

Với cấu hình trên, Caddy chuyển `horse.io.vn` đến frontend, `api.horse.io.vn` đến backend, `auth.horse.io.vn` đến Keycloak, và `s3.horse.io.vn` đến MinIO S3 API. `minio.horse.io.vn` dành riêng cho MinIO Console.

Caddy tự xin và gia hạn chứng chỉ TLS. Domain trong `KEYCLOAK_AUTH_SERVER_URL` và `S3_ENDPOINT` của backend được đặt thành `https://AUTH_DOMAIN` và `https://S3_DOMAIN` để issuer của Keycloak và các presigned URL dùng cùng địa chỉ công khai.

## Sau khi stack chạy

1. Mở `https://minio.example.com`, đăng nhập bằng tài khoản MinIO và tạo bucket trùng với `S3_BUCKET` (mặc định `racehorse-media`).
2. Mở `https://auth.example.com`, tạo realm trùng với `KEYCLOAK_REALM`, rồi tạo client và secret khớp với `KEYCLOAK_CLIENT_ID`/`KEYCLOAK_SECRET`. Issuer của access token phải là `https://AUTH_DOMAIN/realms/KEYCLOAK_REALM`.
3. Chạy migration một lần trong console container `be` (Working directory `/app`):

   ```sh
   node ./node_modules/typeorm/cli.js migration:run -d dist/common/database/data-source.js
   ```

4. Kiểm tra `https://api.example.com/api/v1/health` và `https://api.example.com/docs`.

`docker/init.sql` chỉ chạy khi volume PostgreSQL mới được tạo. Khi dùng volume cũ, cần tạo database `keycloak` thủ công trước khi Keycloak khởi động. Dữ liệu được lưu trong named volumes; xóa stack không đồng nghĩa xóa volume, nhưng chọn xóa volume sẽ xóa dữ liệu.

Lưu ý: stack giữ MinIO image cũ trong cấu hình local của repo để tương thích backend. MinIO Community Edition hiện được phân phối dạng source; các image binary cũ không còn được duy trì. Hãy dùng một dịch vụ S3 được duy trì cho production, hoặc tự build/cập nhật MinIO và thay các biến `S3_*` tương ứng.
