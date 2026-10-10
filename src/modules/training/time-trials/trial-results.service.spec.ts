import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { MediaService } from '../../media/services/media.service';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrialResultsService } from './trial-results.service';

const actor: Actor = { sub: 'kc-ht', roles: [UserRole.HEAD_TRAINER] };
const VIDEO_ID = '11111111-1111-4111-8111-111111111111';

describe('TrialResultsService', () => {
  let access: {
    currentUser: jest.Mock;
    findParticipant: jest.Mock;
    assertCanOperateParticipant: jest.Mock;
    assertCanReadParticipant: jest.Mock;
    lockedSession: jest.Mock;
    lockedParticipant: jest.Mock;
    assertCanManageClass: jest.Mock;
  };
  let media: {
    assertAttachableTrialVideo: jest.Mock;
    signDownloadUrl: jest.Mock;
    signDownloadUrls: jest.Mock;
  };
  let results: { find: jest.Mock };
  let transaction: jest.Mock;
  let manager: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: TrialResultsService;

  beforeEach(() => {
    access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      findParticipant: jest.fn().mockResolvedValue({ sessionId: 's1' }),
      assertCanOperateParticipant: jest.fn().mockResolvedValue(undefined),
      assertCanReadParticipant: jest.fn().mockResolvedValue(undefined),
      lockedSession: jest.fn().mockResolvedValue({
        id: 's1',
        sessionType: TrainingSessionType.TIME_TRIAL,
        status: TrainingSessionStatus.IN_PROGRESS,
      }),
      lockedParticipant: jest
        .fn()
        .mockResolvedValue({ status: SessionParticipantStatus.ONGOING }),
      assertCanManageClass: jest.fn(),
    };
    media = {
      assertAttachableTrialVideo: jest.fn().mockResolvedValue({}),
      signDownloadUrl: jest.fn().mockResolvedValue('https://s3/video'),
      signDownloadUrls: jest.fn().mockResolvedValue(new Map()),
    };
    results = { find: jest.fn().mockResolvedValue([]) };
    manager = {
      findOne: jest.fn(),
      findOneBy: jest.fn((entity: unknown) =>
        Promise.resolve(entity === TimeTrialEntity ? { id: 'tt1' } : null),
      ),
      create: jest.fn((_entity: unknown, row: object) => ({
        id: 'r1',
        ...row,
      })),
      save: jest.fn((row: object) => Promise.resolve(row)),
    };
    transaction = jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    );
    service = new TrialResultsService(
      results as unknown as Repository<TrialResultEntity>,
      access as unknown as TrainingAccessService,
      { transaction, manager: {} } as unknown as DataSource,
      media as unknown as MediaService,
    );
  });

  describe('create', () => {
    const body = { attemptNo: 1, elapsedMs: 61000 };

    it('rejects a video that is not a TRIAL_VIDEO of the caller before opening the transaction', async () => {
      media.assertAttachableTrialVideo.mockRejectedValue(
        new BadRequestException('Tệp không phải video chạy thử'),
      );

      await expect(
        service.create(actor, 'p1', { ...body, videoMediaId: VIDEO_ID }),
      ).rejects.toThrow(
        new BadRequestException('Tệp không phải video chạy thử'),
      );
      expect(media.assertAttachableTrialVideo).toHaveBeenCalledWith(
        'ht-1',
        VIDEO_ID,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('stores the video and returns a signed videoUrl', async () => {
      const result = await service.create(actor, 'p1', {
        ...body,
        videoMediaId: VIDEO_ID,
      });

      expect(result).toMatchObject({
        videoMediaId: VIDEO_ID,
        videoUrl: 'https://s3/video',
      });
      expect(media.signDownloadUrl).toHaveBeenCalledWith(VIDEO_ID);
    });

    it('skips the media checks and returns a null videoUrl without video', async () => {
      const result = await service.create(actor, 'p1', body);

      expect(result.videoUrl).toBeNull();
      expect(media.assertAttachableTrialVideo).not.toHaveBeenCalled();
      expect(media.signDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('signs only after the read check and maps videoUrl per result', async () => {
      results.find.mockResolvedValue([
        { id: 'r1', attemptNo: 1, videoMediaId: VIDEO_ID },
        { id: 'r2', attemptNo: 2, videoMediaId: null },
      ]);
      media.signDownloadUrls.mockResolvedValue(
        new Map([[VIDEO_ID, 'https://s3/video']]),
      );

      const list = await service.list(actor, 'p1');

      expect(list.map((row) => row.videoUrl)).toEqual([
        'https://s3/video',
        null,
      ]);
      expect(media.signDownloadUrls).toHaveBeenCalledWith([VIDEO_ID]);
      expect(
        access.assertCanReadParticipant.mock.invocationCallOrder[0],
      ).toBeLessThan(media.signDownloadUrls.mock.invocationCallOrder[0]);
    });

    it('signs nothing when the caller cannot read the participant', async () => {
      access.assertCanReadParticipant.mockRejectedValue(new Error('403'));

      await expect(service.list(actor, 'p1')).rejects.toThrow('403');
      expect(media.signDownloadUrls).not.toHaveBeenCalled();
    });
  });

  describe('updateVideo', () => {
    const endedSession = (overrides: object = {}) => ({
      id: 's1',
      status: TrainingSessionStatus.COMPLETED,
      scheduledEndAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      ...overrides,
    });

    beforeEach(() => {
      access.findParticipant.mockResolvedValue({
        sessionId: 's1',
        session: { trainingClass: { headTrainerId: 'ht-1' } },
      });
      access.lockedSession.mockResolvedValue(endedSession());
      manager.findOne.mockResolvedValue({
        id: 'r1',
        attemptNo: 2,
        elapsedMs: '61000',
        notes: 'n',
        recordedBy: 'ht-9',
        videoMediaId: null,
      });
    });

    it('sets the video after the session ended and returns a signed videoUrl', async () => {
      const result = await service.updateVideo(actor, 'p1', 2, {
        videoMediaId: VIDEO_ID,
      });

      expect(media.assertAttachableTrialVideo).toHaveBeenCalledWith(
        'ht-1',
        VIDEO_ID,
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          videoMediaId: VIDEO_ID,
          elapsedMs: '61000',
          notes: 'n',
          recordedBy: 'ht-9',
        }),
      );
      expect(result).toMatchObject({
        videoMediaId: VIDEO_ID,
        videoUrl: 'https://s3/video',
      });
    });

    it('removes the video with null without media checks or signing', async () => {
      manager.findOne.mockResolvedValue({ id: 'r1', videoMediaId: VIDEO_ID });

      const result = await service.updateVideo(actor, 'p1', 2, {
        videoMediaId: null,
      });

      expect(result).toMatchObject({ videoMediaId: null, videoUrl: null });
      expect(media.assertAttachableTrialVideo).not.toHaveBeenCalled();
      expect(media.signDownloadUrl).not.toHaveBeenCalled();
    });

    it('validates the video before opening the transaction', async () => {
      media.assertAttachableTrialVideo.mockRejectedValue(
        new BadRequestException('Tệp không phải video chạy thử'),
      );

      await expect(
        service.updateVideo(actor, 'p1', 2, { videoMediaId: VIDEO_ID }),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not the head trainer of the class (403)', async () => {
      access.assertCanManageClass.mockImplementation(() => {
        throw new ForbiddenException('Lớp thuộc HLV trưởng khác');
      });

      await expect(
        service.updateVideo(actor, 'p1', 2, { videoMediaId: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(access.assertCanManageClass).toHaveBeenCalledWith(
        actor,
        'ht-1',
        'ht-1',
      );
      expect(access.assertCanOperateParticipant).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('returns 404 when the attempt does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.updateVideo(actor, 'p1', 9, { videoMediaId: null }),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy lần chạy thử'));
    });

    it('returns 409 when the session is cancelled', async () => {
      access.lockedSession.mockResolvedValue(
        endedSession({ status: TrainingSessionStatus.CANCELLED }),
      );

      await expect(
        service.updateVideo(actor, 'p1', 2, { videoMediaId: null }),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('returns 409 when more than 7 days passed since the scheduled end', async () => {
      access.lockedSession.mockResolvedValue(
        endedSession({
          scheduledEndAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        }),
      );

      await expect(
        service.updateVideo(actor, 'p1', 2, { videoMediaId: null }),
      ).rejects.toThrow(new ConflictException('Quá hạn gắn video chạy thử'));
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
