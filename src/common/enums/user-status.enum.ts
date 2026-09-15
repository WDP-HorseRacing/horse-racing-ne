export enum UserStatus {
  /**
   * Vua dang ky qua /auth/register: chua thuoc CLB nao, chua co role nao.
   * Dang nhap duoc, nhung currentUser() chan het - chi goi duoc route
   * danh dau @Registration(). CLUB_MANAGER duyet thi moi thanh ACTIVE.
   */
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  INACTIVE = 'INACTIVE',
}
