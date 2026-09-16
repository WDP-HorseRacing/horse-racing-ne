import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user.response.dto';
import { toUserResponse } from '../mappers/user.mapper';
import { UsersRepository } from '../repositories/users.repository';
import { UserRole, UserStatus } from '../user.enums';
import { currentUser } from '../utils/current-user';
import { splitFullName } from '../utils/name';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly dataSource: DataSource,
  ) {}

  async list(actor: Actor, limit = 50): Promise<UserResponseDto[]> {
    const clubId = await this.callerClubId(actor);
    const rows = await this.users.listByClub(clubId, Math.min(limit, 200));
    return rows.map(toUserResponse);
  }

  async get(actor: Actor, id: string): Promise<UserResponseDto> {
    const clubId = await this.callerClubId(actor);
    return toUserResponse(await this.findInClub(id, clubId));
  }

  /**
   * Ba buoc: tao danh tinh Keycloak -> gan realm role -> ghi row local.
   * Hong o bat ky buoc nao sau buoc 1 thi xoa danh tinh vua tao.
   *
   * Keycloak truoc, DB sau: hong giua chung thi con lai mot user Keycloak mo
   * coi - nguoi do xac thuc duoc nhung guard tra 403 vi khong co row local,
   * vo hai. Lam nguoc lai se de lai row chiem mat unique (club_id, email),
   * goi lai POST /users la 409 vinh vien, phai vao xoa tay moi go duoc.
   */
  async create(actor: Actor, body: CreateUserDto): Promise<UserResponseDto> {
    const clubId = await this.callerClubId(actor);

    const existing = await this.users.findByEmail(body.email, clubId);
    if (existing) {
      throw new ConflictException('Email nay da co trong cau lac bo');
    }

    const keycloakId = await this.keycloakUsers.registerUserWithPassword({
      // username == email: POST /auth/login gui email, Direct Access Grant
      // lai doi username, nen hai thu nay phai la mot.
      username: body.email,
      email: body.email,
      password: body.password,
      ...splitFullName(body.fullName),
    });

    try {
      // Gan realm role la BAT BUOC, khong phai trang tri: @Access() doc role
      // tu TOKEN, nen user khong co realm role se 403 o moi route phan quyen.
      await this.keycloakUsers.assignRealmRole(keycloakId, body.role);

      const created = await this.users.create({
        clubId,
        keycloakId,
        fullName: body.fullName,
        email: body.email,
        role: body.role,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      });
      return toUserResponse(created);
    } catch (error) {
      await this.compensate(keycloakId, body.email);
      throw error; // nem lai loi GOC
    }
  }

  /** Doi role phai cap nhat CA HAI phia - Keycloak la nguon phan quyen. */
  async update(
    actor: Actor,
    id: string,
    body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const clubId = await this.callerClubId(actor);
    const user = await this.findInClub(id, clubId);

    if (body.role && body.role !== user.role) {
      if (user.role) {
        await this.keycloakUsers.removeRealmRole(user.keycloakId, user.role);
      }
      await this.keycloakUsers.assignRealmRole(user.keycloakId, body.role);
    }
    await this.users.updateFields(id, clubId, {
      ...(body.fullName ? { fullName: body.fullName } : {}),
      ...(body.role ? { role: body.role } : {}),
    });
    return toUserResponse(await this.findInClub(id, clubId));
  }

  /**
   * Khoa user: cap nhat DB (currentUser() nem 403 ngay o request ke tiep) VA
   * tat o Keycloak (refresh token con song khong the de ra access token moi).
   *
   * Day la cong cu chan TUC THI - khac voi doi role, thu phai doi token moi.
   */
  async setStatus(
    actor: Actor,
    id: string,
    status: UserStatus,
  ): Promise<UserResponseDto> {
    const clubId = await this.callerClubId(actor);
    const user = await this.findInClub(id, clubId);

    await this.users.updateFields(id, clubId, { status });
    await this.keycloakUsers.setUserEnabled(
      user.keycloakId,
      status === UserStatus.ACTIVE,
    );
    return toUserResponse(await this.findInClub(id, clubId));
  }

  /** Hang doi duyet: nguoi chon dung CLB nay, cong nguoi chua chon CLB nao. */
  async listPending(actor: Actor): Promise<UserResponseDto[]> {
    const clubId = await this.callerClubId(actor);
    const rows = await this.users.listPending(clubId);
    return rows.map(toUserResponse);
  }

  /**
   * Duyet mot ho so cho: gan CLB + role, mo khoa tai khoan.
   * Keycloak truoc, DB sau - vi @Access() doc role tu token, nen chua gan
   * realm role thi du DB co ghi ACTIVE nguoi do van 403.
   */
  async approve(
    actor: Actor,
    id: string,
    role: UserRole,
  ): Promise<UserResponseDto> {
    const clubId = await this.callerClubId(actor);
    const target = await this.users.findPendingById(id);
    // Da chon CLB khac thi khong phai viec cua quan ly nay. Tra 404 chu khong
    // 403: noi "co ho so nay nhung anh khong duoc xem" cung la mot ro ri.
    if (!target || (target.clubId !== null && target.clubId !== clubId)) {
      throw new NotFoundException('Khong tim thay ho so cho duyet');
    }

    await this.keycloakUsers.assignRealmRole(target.keycloakId, role);
    await this.users.updateById(id, {
      clubId,
      role,
      status: UserStatus.ACTIVE,
    });
    return toUserResponse({
      ...target,
      clubId,
      role,
      status: UserStatus.ACTIVE,
    });
  }

  /**
   * clubId khong nam trong token, nen moi thao tac deu bat dau bang viec doi
   * actor lay row that. Guard da dam bao row nay ton tai va dang ACTIVE.
   */
  private async callerClubId(actor: Actor): Promise<string> {
    const caller = await currentUser(this.dataSource.manager, actor);
    if (!caller.clubId) {
      throw new ForbiddenException('Tai khoan chua thuoc cau lac bo nao');
    }
    return caller.clubId;
  }

  private async findInClub(id: string, clubId: string) {
    const user = await this.users.findById(id, clubId);
    if (!user) throw new NotFoundException('Khong tim thay user');
    return user;
  }

  /**
   * Nuot loi cua chinh no va log that to. Neu rollback cung fail thi client
   * van phai thay loi GOC - thay bang "Keycloak khong ket noi duoc" se che mat
   * thong tin that su huu ich nhu "email da ton tai".
   */
  private async compensate(keycloakId: string, email: string): Promise<void> {
    try {
      await this.keycloakUsers.deleteUser(keycloakId);
    } catch {
      this.logger.error(
        `User Keycloak mo coi ${keycloakId} (${email}): row local khong tao duoc ` +
          'va lenh xoa bu cung that bai. Vao Admin Console xoa tay.',
      );
    }
  }
}
