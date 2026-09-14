export function validateEnvironment(config: Record<string, unknown>) {
  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  if (typeof config.DATABASE_URL !== 'string' || !config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  return { ...config, PORT: port };
}
