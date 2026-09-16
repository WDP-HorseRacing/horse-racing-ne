import type { UserRole } from '../enums/role.enum';

export interface Actor {
  sub: string;
  email?: string;
  name?: string;
  roles: UserRole[];
}
