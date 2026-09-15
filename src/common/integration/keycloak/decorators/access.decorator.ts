import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../../modules/users/user.enums';
import { ACCESS_KEY } from '../keycloak.constants';

/**
 * Gioi han route cho cac role nay, so voi `actor.roles` lay tu token.
 * Ngu nghia OR: co MOT role trong danh sach la du.
 */
export const Access = (roles: UserRole[]) => SetMetadata(ACCESS_KEY, roles);
