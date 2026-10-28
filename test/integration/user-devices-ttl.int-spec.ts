import type { Model } from 'mongoose';
import { DevicePlatform } from '../../src/modules/notifications/enums/device-platform.enum';
import {
  UserDevice,
  UserDeviceSchema,
} from '../../src/modules/notifications/schemas/user-device.schema';
import { startTestMongo, stopTestMongo, type TestMongo } from './mongo';

const DAY_MS = 86_400_000;

describe('user_devices stale token cleanup (MongoDB)', () => {
  let mongo: TestMongo;
  let devices: Model<UserDevice>;

  beforeAll(async () => {
    mongo = await startTestMongo();
    devices = mongo.connection.model(UserDevice.name, UserDeviceSchema);
    await devices.init();
    await mongo.connection.db!.admin().command({
      setParameter: 1,
      ttlMonitorSleepSecs: 1,
    });
  });

  afterAll(() => stopTestMongo(mongo));

  it('removes devices not refreshed for more than 60 days and keeps the rest', async () => {
    const device = (token: string, ageDays: number) => ({
      _id: token,
      userId: 'user-1',
      platform: DevicePlatform.ANDROID,
      updatedAt: new Date(Date.now() - ageDays * DAY_MS),
    });
    await devices.insertMany([device('t-stale', 61), device('t-fresh', 59)]);

    let left: string[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      left = (await devices.find().lean()).map((d) => d._id);
      if (!left.includes('t-stale')) break;
    }

    expect(left).toEqual(['t-fresh']);
  }, 60_000);
});
