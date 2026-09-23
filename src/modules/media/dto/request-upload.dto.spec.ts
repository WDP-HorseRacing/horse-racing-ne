import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { RequestUploadDto } from './request-upload.dto';

function build(overrides: Partial<RequestUploadDto>): RequestUploadDto {
  return plainToInstance(RequestUploadDto, {
    purpose: MediaPurpose.HORSE_PHOTO,
    fileName: 'horse.jpg',
    mimeType: 'image/jpeg',
    byteSize: 1024,
    ...overrides,
  });
}

async function failedFields(dto: RequestUploadDto): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('RequestUploadDto', () => {
  it('accepts a normal upload request', async () => {
    await expect(failedFields(build({}))).resolves.toEqual([]);
  });

  it('accepts a mime type of exactly 120 characters', async () => {
    await expect(
      failedFields(build({ mimeType: 'a'.repeat(120) })),
    ).resolves.toEqual([]);
  });

  it('rejects a mime type longer than the media_assets.mime_type column', async () => {
    await expect(
      failedFields(build({ mimeType: 'a'.repeat(121) })),
    ).resolves.toEqual(['mimeType']);
  });

  it('accepts a file name of exactly 255 characters', async () => {
    await expect(
      failedFields(build({ fileName: 'a'.repeat(255) })),
    ).resolves.toEqual([]);
  });

  it('rejects a file name longer than 255 characters', async () => {
    await expect(
      failedFields(build({ fileName: 'a'.repeat(256) })),
    ).resolves.toEqual(['fileName']);
  });
});
