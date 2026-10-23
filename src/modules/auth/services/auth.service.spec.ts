import { BadRequestException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import type { Actor } from '../../../common/types/actor';
import { AuthService } from './auth.service';

describe('AuthService.changePassword', () => {
  const actor = { sub: 'user-1', email: 'a@b.c' } as Actor;
  const exchangePasswordForToken = jest.fn();
  const resetUserPassword = jest.fn();
  const logoutUser = jest.fn();
  const service = new AuthService(
    { exchangePasswordForToken } as never,
    { resetUserPassword, logoutUser } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { manager: { findOne: jest.fn().mockResolvedValue(null) } } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('mật khẩu hiện tại sai: 400 gắn với ô currentPassword, không đổi mật khẩu', async () => {
    exchangePasswordForToken.mockRejectedValue(new Error('invalid_grant'));

    const error = await service
      .changePassword(actor, 'sai', 'moi')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Mật khẩu hiện tại không đúng',
      errors: [
        { field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' },
      ],
    });
    expect(resetUserPassword).not.toHaveBeenCalled();
  });

  it('mật khẩu hiện tại đúng: đổi mật khẩu rồi đăng xuất các phiên', async () => {
    exchangePasswordForToken.mockResolvedValue({});

    await service.changePassword(actor, 'dung', 'moi');

    expect(resetUserPassword).toHaveBeenCalledWith('user-1', 'moi');
    expect(logoutUser).toHaveBeenCalledWith('user-1');
  });
});

describe('AuthService.logout', () => {
  const revokeRefreshToken = jest.fn();
  const findOne = jest.fn();
  const record = jest.fn();
  const removeUserDevice = jest.fn();
  const service = new AuthService(
    { revokeRefreshToken } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { manager: { findOne } } as never,
    { record },
    { removeUserDevice } as never,
  );
  const refreshToken = sign({ sub: 'kc-1' }, 'secret');

  beforeEach(() => {
    jest.resetAllMocks();
    findOne.mockResolvedValue({ id: 'user-1' });
  });

  it('gửi deviceToken: gỡ thiết bị đó của chính người đăng xuất', async () => {
    await service.logout(refreshToken, 'fcm-1');

    expect(revokeRefreshToken).toHaveBeenCalledWith({ refreshToken });
    expect(removeUserDevice).toHaveBeenCalledWith('user-1', 'fcm-1');
  });

  it('không gửi deviceToken: không gỡ thiết bị nào', async () => {
    await service.logout(refreshToken);

    expect(record).toHaveBeenCalled();
    expect(removeUserDevice).not.toHaveBeenCalled();
  });

  it('refresh token không thuộc tài khoản local: không gỡ thiết bị', async () => {
    findOne.mockResolvedValue(null);

    await service.logout(refreshToken, 'fcm-1');

    expect(removeUserDevice).not.toHaveBeenCalled();
  });

  it('gỡ thiết bị lỗi: đăng xuất vẫn thành công', async () => {
    removeUserDevice.mockRejectedValue(new Error('mongo down'));

    await expect(
      service.logout(refreshToken, 'fcm-1'),
    ).resolves.toBeUndefined();
    expect(revokeRefreshToken).toHaveBeenCalled();
    expect(record).toHaveBeenCalled();
  });

  it('Keycloak từ chối thu hồi: không gỡ thiết bị', async () => {
    revokeRefreshToken.mockRejectedValue(new Error('502'));

    await expect(service.logout(refreshToken, 'fcm-1')).rejects.toThrow('502');
    expect(removeUserDevice).not.toHaveBeenCalled();
  });
});
