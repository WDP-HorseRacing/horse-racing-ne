import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import { RegisterDeviceDto } from '../dto';
import { UserDevice } from '../schemas/user-device.schema';

@Injectable()
export class UserDevicesService {
  constructor(
    @InjectModel(UserDevice.name)
    private readonly devices: Model<UserDevice>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Đăng ký thiết bị nhận push cho người gọi
   *
   * - Token chưa có: thêm mới
   * - Token đã có (kể cả của người khác, vd đổi tài khoản trên cùng máy): chuyển sang người gọi và cập nhật nền tảng
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Token FCM và nền tảng của thiết bị
   * @returns Promise hoàn tất khi đã lưu
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async register(actor: Actor, body: RegisterDeviceDto): Promise<void> {
    const user = await currentUserForActor(this.dataSource.manager, actor);
    await this.devices.updateOne(
      { _id: body.token },
      {
        $set: {
          userId: user.id,
          platform: body.platform,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /**
   * Gỡ thiết bị của người gọi (vd khi đăng xuất)
   *
   * - Token không có hoặc đang thuộc người khác: không đổi gì
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param token FCM registration token cần gỡ
   * @returns Promise hoàn tất khi đã gỡ
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async unregister(actor: Actor, token: string): Promise<void> {
    const user = await currentUserForActor(this.dataSource.manager, actor);
    await this.devices.deleteOne({ _id: token, userId: user.id });
  }
}
