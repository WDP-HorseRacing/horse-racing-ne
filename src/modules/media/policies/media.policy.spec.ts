import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import {
  CHECKLIST_EVIDENCE_MAX_BYTES,
  HORSE_PHOTO_MAX_BYTES,
  INCIDENT_PHOTO_MAX_BYTES,
  TRIAL_VIDEO_MAX_BYTES,
} from '../constants/media.constants';
import { MediaPurpose } from '../enums/media-purpose.enum';
import {
  assertCanUploadMedia,
  assertChecklistEvidenceSpec,
  assertHorsePhotoSpec,
  assertIncidentPhotoSpec,
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

  it.each([
    ['image/jpeg', 1],
    ['image/webp', INCIDENT_PHOTO_MAX_BYTES],
  ])('accepts incident photo %s with %d bytes', (mime, size) => {
    expect(() =>
      assertMediaSpec(MediaPurpose.INCIDENT_PHOTO, mime, size),
    ).not.toThrow();
  });

  it.each([
    ['video/mp4', 10],
    ['image/png', INCIDENT_PHOTO_MAX_BYTES + 1],
  ])('rejects incident photo %s with %d bytes', (mime, size) => {
    expect(() => assertIncidentPhotoSpec(mime, size)).toThrow(
      BadRequestException,
    );
  });

  it('keeps incident photos in their own folder', () => {
    const key = buildMediaObjectKey(
      MediaPurpose.INCIDENT_PHOTO,
      'a1',
      'image/png',
    );
    expect(key).toBe('incident-photos/a1.png');
    expect(mediaPurposeOfObjectKey(key)).toBe(MediaPurpose.INCIDENT_PHOTO);
  });

  it.each([
    ['image/jpeg', 1],
    ['image/webp', CHECKLIST_EVIDENCE_MAX_BYTES],
  ])('accepts checklist evidence %s with %d bytes', (mime, size) => {
    expect(() => assertChecklistEvidenceSpec(mime, size)).not.toThrow();
    expect(() =>
      assertMediaSpec(MediaPurpose.CHECKLIST_EVIDENCE, mime, size),
    ).not.toThrow();
  });

  it('rejects unsupported or oversized checklist evidence', () => {
    expect(() => assertChecklistEvidenceSpec('image/gif', 100)).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertChecklistEvidenceSpec(
        'image/png',
        CHECKLIST_EVIDENCE_MAX_BYTES + 1,
      ),
    ).toThrow(BadRequestException);
  });

  it('keeps checklist evidence in its own folder', () => {
    const key = buildMediaObjectKey(
      MediaPurpose.CHECKLIST_EVIDENCE,
      'a1',
      'image/png',
    );
    expect(key).toBe('checklist-evidence/a1.png');
    expect(mediaPurposeOfObjectKey(key)).toBe(MediaPurpose.CHECKLIST_EVIDENCE);
  });

  it('lets only a groom upload checklist evidence', () => {
    expect(() =>
      assertCanUploadMedia(
        { sub: 'g', roles: [UserRole.GROOM] },
        MediaPurpose.CHECKLIST_EVIDENCE,
      ),
    ).not.toThrow();
    expect(() =>
      assertCanUploadMedia(
        { sub: 'h', roles: [UserRole.HEAD_TRAINER] },
        MediaPurpose.CHECKLIST_EVIDENCE,
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets only a groom upload an incident photo', () => {
    expect(() =>
      assertCanUploadMedia(
        { sub: 'g', roles: [UserRole.GROOM] },
        MediaPurpose.INCIDENT_PHOTO,
      ),
    ).not.toThrow();
    expect(() =>
      assertCanUploadMedia(
        { sub: 'h', roles: [UserRole.HEAD_TRAINER] },
        MediaPurpose.INCIDENT_PHOTO,
      ),
    ).toThrow(ForbiddenException);
  });
});
