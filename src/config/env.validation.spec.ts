import { validateEnvironment } from './env.validation';

const validEnvironment = {
  DB_HOST: '127.0.0.1',
  DB_USERNAME: 'racehorse',
  DB_PASSWORD: 'racehorse',
  DB_NAME: 'racehorse',
  MONGO_URI: 'mongodb://127.0.0.1:27017/racehorse',
  REDIS_HOST: '127.0.0.1',
  KEYCLOAK_AUTH_SERVER_URL: 'http://127.0.0.1:8080',
  KEYCLOAK_REALM: 'racehorse',
  KEYCLOAK_CLIENT_ID: 'backend-service',
  KEYCLOAK_SECRET: 'super-secret',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'racehorse-media',
  S3_ACCESS_KEY: 'racehorse',
  S3_SECRET_KEY: 'racehorse-minio-secret',
};

describe('validateEnvironment', () => {
  it('applies object storage defaults and converts their types', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      S3_FORCE_PATH_STYLE: true,
      S3_PRESIGNED_URL_TTL_SECONDS: 900,
    });
  });

  it('requires the MongoDB connection string', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, MONGO_URI: '' }),
    ).toThrow('MONGO_URI is required');
  });

  it('accepts a configuration without Firebase', () => {
    expect(() => validateEnvironment(validEnvironment)).not.toThrow();
  });

  it('rejects a partial Firebase service account', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        FIREBASE_PROJECT_ID: 'racehorse',
        FIREBASE_CLIENT_EMAIL: 'fcm@racehorse.iam.gserviceaccount.com',
      }),
    ).toThrow(
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY must be set together',
    );
  });

  it('rejects an invalid S3 endpoint', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, S3_ENDPOINT: 'minio' }),
    ).toThrow('S3_ENDPOINT must be a valid URL');
  });

  it('rejects a presigned URL lifetime outside the supported range', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        S3_PRESIGNED_URL_TTL_SECONDS: 30,
      }),
    ).toThrow(
      'S3_PRESIGNED_URL_TTL_SECONDS must be an integer between 60 and 3600',
    );
  });
});
