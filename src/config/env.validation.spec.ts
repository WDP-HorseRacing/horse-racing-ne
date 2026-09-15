import { validateEnvironment } from './env.validation';

const validEnvironment = {
  DB_HOST: '127.0.0.1',
  DB_USERNAME: 'racehorse',
  DB_PASSWORD: 'racehorse',
  DB_NAME: 'racehorse',
  REDIS_HOST: '127.0.0.1',
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
