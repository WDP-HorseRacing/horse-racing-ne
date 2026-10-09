import { BadRequestException } from '@nestjs/common';
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
