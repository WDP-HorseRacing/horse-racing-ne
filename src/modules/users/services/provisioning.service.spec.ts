import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../user.enums';
import { ProvisioningService } from './provisioning.service';

describe('ProvisioningService.requireProvisionedUser', () => {
  let findOne: jest.Mock;
  let service: ProvisioningService;

  beforeEach(() => {
    findOne = jest.fn();
    service = new ProvisioningService({
      manager: { findOne },
    } as unknown as Repository<UserEntity>);
  });

  it('returns the active local account linked to the token subject', async () => {
    const user = { id: 'user-1', status: UserStatus.ACTIVE };
    findOne.mockResolvedValue(user);

    await expect(service.requireProvisionedUser({ sub: 'kc-1' })).resolves.toBe(
      user,
    );
    expect(findOne).toHaveBeenCalledWith(UserEntity, {
      where: { keycloakId: 'kc-1' },
    });
  });

  it('returns 401 when the account has not been provisioned', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.requireProvisionedUser({ sub: 'kc-1' }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Tài khoản chưa được cấp. Vui lòng liên hệ Club Manager.',
      ),
    );
  });

  it.each([UserStatus.INACTIVE, UserStatus.LOCKED])(
    'returns 401 when the account is %s',
    async (status) => {
      findOne.mockResolvedValue({ id: 'user-1', status });

      await expect(
        service.requireProvisionedUser({ sub: 'kc-1' }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Tài khoản không ở trạng thái hoạt động. Vui lòng liên hệ Club Manager.',
        ),
      );
    },
  );
});
