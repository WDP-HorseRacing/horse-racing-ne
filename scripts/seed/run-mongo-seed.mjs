import 'dotenv/config';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

// Dữ liệu ảo cho MongoDB ở môi trường dev. Chạy: pnpm db:seed:mongo (sau pnpm db:seed).
// Chạy lại nhiều lần được: id cố định + $setOnInsert, bản ghi đã có thì giữ nguyên.

const USERS = {
  clubManager: '4d2f2949-9d29-4a64-81c0-807c481188f1',
  headTrainer: '91315bf7-3eef-4d8c-a403-c20245b6cb36',
  owner: '0831b413-cf10-445e-96eb-97f354ef517d',
  groom: '793a2d08-28af-4652-9988-037be0d111de',
  vet: 'd5a2188a-ab75-4537-b370-ddfc7c31e8ae',
};
const SAO_MAI_HORSE_ID = 'a0000000-0000-4000-8000-000000000001';

const deterministicUuid = (key) => {
  const hex = createHash('sha1').update(`seed:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const horseResource = { type: 'HORSE', id: SAO_MAI_HORSE_ID };
const samples = [
  {
    recipients: [USERS.vet, USERS.headTrainer],
    category: 'MEASUREMENT_ALERT',
    priority: 'URGENT',
    title: 'KHẨN: Ngựa Sao Mai bị sốt',
    message: 'Ngựa Sao Mai có thân nhiệt 39.4 °C, vượt ngưỡng sốt. Cần kiểm tra ngay.',
    hoursAgo: 2,
    read: false,
  },
  {
    recipients: [USERS.headTrainer],
    category: 'BARN_ASSIGNED',
    priority: 'NORMAL',
    title: 'Ngựa mới vào khu phụ trách',
    message: 'Ngựa Sao Mai vừa được xếp vào khu "Khu A". Vui lòng xếp ô chuồng và đăng ký lớp huấn luyện nếu cần.',
    hoursAgo: 30,
    read: true,
  },
  {
    recipients: [USERS.groom],
    category: 'GROOM_ASSIGNMENT',
    priority: 'NORMAL',
    title: 'Phân công chăm ngựa mới',
    message: 'Bạn được phân công chăm sóc ngựa Sao Mai. Công việc hằng ngày của ngựa này giờ thuộc về bạn.',
    hoursAgo: 26,
    read: false,
  },
  {
    recipients: [USERS.owner, USERS.clubManager],
    category: 'HEALTH_STATUS',
    priority: 'HIGH',
    title: 'Ngựa Sao Mai: Chấn thương',
    message: 'Trạng thái sức khỏe của ngựa Sao Mai chuyển từ Đủ điều kiện sang Chấn thương. Ngựa không được tập và không được đua.',
    hoursAgo: 5,
    read: false,
  },
];

const now = Date.now();
const operations = samples.flatMap((sample, index) =>
  sample.recipients.map((recipientId) => {
    const createdAt = new Date(now - sample.hoursAgo * 3_600_000);
    return {
      updateOne: {
        filter: { _id: deterministicUuid(`notification:${index}:${recipientId}`) },
        update: {
          $setOnInsert: {
            eventId: deterministicUuid(`event:${index}`),
            recipientId,
            category: sample.category,
            priority: sample.priority,
            title: sample.title,
            message: sample.message,
            resource: horseResource,
            readAt: sample.read ? new Date(createdAt.getTime() + 600_000) : null,
            createdAt,
          },
        },
        upsert: true,
      },
    };
  }),
);

try {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await mongoose.connection
    .collection('notifications')
    .bulkWrite(operations, { ordered: false });
  console.log(
    `Seed Mongo xong: ${result.upsertedCount} thông báo mới, ${operations.length - result.upsertedCount} đã có`,
  );
} catch (error) {
  console.error(`Seed Mongo lỗi: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
