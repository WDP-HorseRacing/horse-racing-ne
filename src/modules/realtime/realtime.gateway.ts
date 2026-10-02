import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket, type DefaultEventsMap } from 'socket.io';
import { DataSource } from 'typeorm';
import { currentUser } from '../users/utils/current-user';
import type { Actor } from '../../common/types/actor';
import { UserRole } from '../../common/enums/role.enum';
import { KeycloakService } from '../../common/infrastructure/keycloak/keycloak.service';

/**
 * Kiểu dữ liệu của `socket.data`, truyền vào tham số thứ tư của Socket<>
 */
interface RealtimeSocketData {
  actor: Actor;
  userId: string;
  expiry: ReturnType<typeof setTimeout>;
}

type RealtimeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  RealtimeSocketData
>;

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
  },
})
export class RealtimeGateway
  implements
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly keycloak: KeycloakService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Xác thực socket vừa kết nối và cho vào room riêng của user
   *
   * - Access token lấy từ `handshake.auth.token`
   * - Thiếu token, token không hợp lệ, tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò: ghi log warning rồi ngắt kết nối
   * - Hợp lệ: gắn actor và userId vào `socket.data`, join room `user:<userId>`, hẹn ngắt kết nối khi access token hết hạn
   *
   * @param client Socket vừa kết nối
   * @returns Promise hoàn tất khi đã nhận hoặc đã ngắt kết nối socket
   */
  async handleConnection(client: RealtimeSocket): Promise<void> {
    try {
      // handshake.auth chu khong phai query string: query string lot vao
      // access log cua proxy va cua server.
      const raw: unknown = client.handshake.auth?.token;
      if (typeof raw !== 'string' || !raw) {
        throw new Error('Thieu access token trong handshake auth.token');
      }

      // Cung mot ham verify voi HTTP guard: mot bo luat duy nhat.
      const token = await this.keycloak.verifyToken(raw);
      const user = await currentUser(this.dataSource.manager, token.sub);
      if (!user.role) {
        throw new Error('Tai khoan chua duoc gan vai tro');
      }
      const actor: Actor = {
        sub: token.sub,
        email: token.email,
        name: token.name,
        roles: token.roles.filter((role): role is UserRole =>
          Object.values(UserRole).includes(role as UserRole),
        ),
      };

      client.data.actor = actor;
      client.data.userId = user.id;

      await client.join(`user:${user.id}`);

      // Socket song lau, access token thi khong. Khong co dong nay thi mot
      // ket noi mo luc 09:00 giu nguyen dac quyen den khi restart process,
      // ke ca sau khi token het han va nguoi do bi khoa.
      // Clamp 2^31-1: timer cua Node tran sau ~24.8 ngay va se ban NGAY LAP TUC.
      client.data.expiry = setTimeout(
        () => client.disconnect(true),
        Math.min(2_147_483_647, Math.max(0, token.exp * 1000 - Date.now())),
      );
    } catch (error) {
      this.logger.warn(
        `Tu choi socket ${client.id}: ${
          error instanceof Error ? error.message : 'handshake that bai'
        }`,
      );
      client.disconnect(true);
    }
  }

  /**
   * Hủy hẹn giờ ngắt kết nối của socket vừa ngắt
   *
   * @param client Socket vừa ngắt kết nối
   */
  handleDisconnect(client: RealtimeSocket): void {
    clearTimeout(client.data.expiry);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  /**
   * Phát event tới mọi socket đang mở của một user
   *
   * @param userId UUID của user nhận event
   * @param event Tên event
   * @param payload Dữ liệu gửi kèm event
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
