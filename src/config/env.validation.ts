export function validateEnvironment(config: Record<string, unknown>) {
  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  const databasePort = Number(config.DB_PORT ?? 5432);
  if (
    !Number.isInteger(databasePort) ||
    databasePort < 1 ||
    databasePort > 65535
  ) {
    throw new Error('DB_PORT must be a valid TCP port');
  }

  for (const key of ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME']) {
    if (typeof config[key] !== 'string' || !config[key]) {
      throw new Error(`${key} is required`);
    }
  }

  const redisPort = Number(config.REDIS_PORT ?? 6379);
  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }

  if (typeof config.REDIS_HOST !== 'string' || !config.REDIS_HOST) {
    throw new Error('REDIS_HOST is required');
  }

  for (const key of [
    'KEYCLOAK_AUTH_SERVER_URL',
    'KEYCLOAK_REALM',
    'KEYCLOAK_CLIENT_ID',
    'KEYCLOAK_SECRET',
  ]) {
    if (typeof config[key] !== 'string' || !config[key]) {
      throw new Error(`${key} is required`);
    }
  }

  const authServerUrl = String(config.KEYCLOAK_AUTH_SERVER_URL).replace(
    /\/+$/,
    '',
  );
  if (!/^https?:\/\//.test(authServerUrl)) {
    throw new Error(
      'KEYCLOAK_AUTH_SERVER_URL must start with http:// or https://',
    );
  }

  return {
    ...config,
    PORT: port,
    DB_PORT: databasePort,
    REDIS_PORT: redisPort,
    KEYCLOAK_AUTH_SERVER_URL: authServerUrl,
  };
}
