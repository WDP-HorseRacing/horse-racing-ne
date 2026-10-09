import { BadRequestException } from '@nestjs/common';
import {
  HORSE_PHOTO_MAX_BYTES,
  TRIAL_VIDEO_MAX_BYTES,
} from '../constants/media.constants';
import { MediaPurpose } from '../enums/media-purpose.enum';
import {
  assertHorsePhotoSpec,
  assertMediaSpec,
  assertTrialVideoSpec,
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

  it.each([
    ['video/mp4', 1],
    ['video/webm', 500],
    ['Video/QuickTime', TRIAL_VIDEO_MAX_BYTES],
  ])('accepts trial video %s with %d bytes', (mime, size) => {
    expect(() => assertTrialVideoSpec(mime, size)).not.toThrow();
    expect(() =>
      assertMediaSpec(MediaPurpose.TRIAL_VIDEO, mime, size),
    ).not.toThrow();
  });

  it.each([
    ['image/jpeg', 10],
    ['video/x-msvideo', 10],
    ['video/mp4', 0],
    ['video/mp4', Number.NaN],
    ['video/mp4', TRIAL_VIDEO_MAX_BYTES + 1],
  ])('rejects trial video %s with %d bytes', (mime, size) => {
    expect(() => assertTrialVideoSpec(mime, size)).toThrow(BadRequestException);
  });

  it('builds trial video keys with the container extension', () => {
    expect(
      buildMediaObjectKey(MediaPurpose.TRIAL_VIDEO, 'a1', 'video/quicktime'),
    ).toBe('trial-videos/a1.mov');
    expect(mediaPurposeOfObjectKey('trial-videos/a1.mp4')).toBe(
      MediaPurpose.TRIAL_VIDEO,
    );
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
