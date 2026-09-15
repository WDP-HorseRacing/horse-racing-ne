export function validateEnvironment(config: Record<string, unknown>) {
  const port = parsePort(config.PORT ?? 3000, 'PORT');
  const databasePort = parsePort(config.DB_PORT ?? 5432, 'DB_PORT');
  const redisPort = parsePort(config.REDIS_PORT ?? 6379, 'REDIS_PORT');

  requireStrings(config, [
    'DB_HOST',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_HOST',
    'KEYCLOAK_AUTH_SERVER_URL',
    'KEYCLOAK_REALM',
    'KEYCLOAK_CLIENT_ID',
    'KEYCLOAK_SECRET',
  ]);

  requireStrings(config, [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
  ]);

  const authServerUrl = String(config.KEYCLOAK_AUTH_SERVER_URL).replace(
    /\/+$/,
    '',
  );
  if (!/^https?:\/\//.test(authServerUrl)) {
    throw new Error(
      'KEYCLOAK_AUTH_SERVER_URL must start with http:// or https://',
    );
  }

  try {
    new URL(config.S3_ENDPOINT as string);
  } catch {
    throw new Error('S3_ENDPOINT must be a valid URL');
  }

  const presignedUrlTtlSeconds = Number(
    config.S3_PRESIGNED_URL_TTL_SECONDS ?? 900,
  );
  if (
    !Number.isInteger(presignedUrlTtlSeconds) ||
    presignedUrlTtlSeconds < 60 ||
    presignedUrlTtlSeconds > 3600
  ) {
    throw new Error(
      'S3_PRESIGNED_URL_TTL_SECONDS must be an integer between 60 and 3600',
    );
  }

  const forcePathStyle = parseBoolean(
    config.S3_FORCE_PATH_STYLE ?? true,
    'S3_FORCE_PATH_STYLE',
  );

  return {
    ...config,
    PORT: port,
    DB_PORT: databasePort,
    REDIS_PORT: redisPort,
    KEYCLOAK_AUTH_SERVER_URL: authServerUrl,
    S3_FORCE_PATH_STYLE: forcePathStyle,
    S3_PRESIGNED_URL_TTL_SECONDS: presignedUrlTtlSeconds,
  };
}

function parsePort(value: unknown, key: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${key} must be a valid TCP port`);
  }
  return port;
}

function requireStrings(config: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    if (typeof config[key] !== 'string' || !config[key]) {
      throw new Error(`${key} is required`);
    }
  }
}

function parseBoolean(value: unknown, key: string): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}
