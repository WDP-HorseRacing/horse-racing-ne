import { BadRequestException } from '@nestjs/common';
import { HORSE_PHOTO_MAX_BYTES } from '../constants/media.constants';
import { MediaPurpose } from '../enums/media-purpose.enum';
import {
  assertHorsePhotoSpec,
  buildMediaObjectKey,
  mediaPurposeOfObjectKey,
  normalizeContentType,
} from './media.policy';

describe('media.policy', () => {
  it('normalizes content type parameters and case', () => {
    expect(normalizeContentType(' Image/JPEG; charset=binary')).toBe(
      'image/jpeg',
    );
  });

  it.each([
    ['image/jpeg', 1],
    ['image/png', HORSE_PHOTO_MAX_BYTES],
    ['image/webp', 500],
  ])('accepts %s with %d bytes', (mime, size) => {
    expect(() => assertHorsePhotoSpec(mime, size)).not.toThrow();
  });

  it.each([
    ['image/gif', 10],
    ['image/jpeg', 0],
    ['image/jpeg', Number.NaN],
    ['image/jpeg', HORSE_PHOTO_MAX_BYTES + 1],
  ])('rejects %s with %d bytes', (mime, size) => {
    expect(() => assertHorsePhotoSpec(mime, size)).toThrow(BadRequestException);
  });

  it('builds the key from purpose, id and mime type, ignoring the client file name', () => {
    expect(
      buildMediaObjectKey(MediaPurpose.HORSE_PHOTO, 'a1', 'image/webp'),
    ).toBe('horse-photos/a1.webp');
  });

  it('reads the purpose back from the key prefix', () => {
    expect(mediaPurposeOfObjectKey('horse-photos/a1.jpg')).toBe(
      MediaPurpose.HORSE_PHOTO,
    );
    expect(mediaPurposeOfObjectKey('other/a1.jpg')).toBeUndefined();
  });
});
