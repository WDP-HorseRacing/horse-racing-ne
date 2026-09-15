-- Tạo database riêng cho Keycloak bên trong container postgres dùng chung.
-- Script trong /docker-entrypoint-initdb.d/ CHỈ chạy khi volume dữ liệu còn rỗng:
-- nếu đã từng `docker compose up`, phải `docker compose down -v` rồi dựng lại,
-- hoặc tự tạo bằng tay:
--   docker compose exec postgres psql -U racehorse -c 'CREATE DATABASE keycloak'
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS
  (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
