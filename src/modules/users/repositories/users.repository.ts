import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../user.enums';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findById(id: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id, clubId });
  }

  listByClub(clubId: string, limit: number): Promise<UserEntity[]> {
    return this.repository.find({
      where: { clubId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findByEmail(email: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ email, clubId });
  }

  /** Khong co clubId: dung luc dang ky, truoc khi biet nguoi nay thuoc CLB nao. */
  findByKeycloakId(keycloakId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ keycloakId });
  }

  /**
   * Hang doi duyet cua mot CLB: nguoi da chon dung CLB nay, cong nhung nguoi
   * dang ky ma khong chon CLB nao (clubId NULL) - ho nam o ho chung.
   */
  listPending(clubId: string): Promise<UserEntity[]> {
    return this.repository.find({
      where: [
        { status: UserStatus.PENDING, clubId },
        { status: UserStatus.PENDING, clubId: IsNull() },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  /** Tim theo id trong hang doi duyet. Khong loc clubId vi no co the dang NULL. */
  findPendingById(id: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id, status: UserStatus.PENDING });
  }

  create(user: Partial<UserEntity>): Promise<UserEntity> {
    return this.repository.save(this.repository.create(user));
  }

  async updateFields(
    id: string,
    clubId: string,
    changes: Partial<UserEntity>,
  ): Promise<void> {
    await this.repository.update({ id, clubId }, changes);
  }

  /** Chi dung cho buoc duyet: luc nay row co the chua co clubId de doi chieu. */
  async updateById(id: string, changes: Partial<UserEntity>): Promise<void> {
    await this.repository.update({ id }, changes);
  }

  async deleteById(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
