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
import { KeycloakService } from '../../common/infrastructure/keycloak/keycloak.service';

/**
 * `socket.data` mac dinh la `any`, nghia la moi lan doc no deu khong duoc kiem
 * kieu. Khai bao ra day roi truyen vao tham so thu tu cua Socket<> de bien no
 * thanh du lieu co kieu that.
 */
interface RealtimeSocketData {
  actor: Actor;
  userId: string;
  clubId: string | null;
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
      if (!user.clubId || !user.role) {
        throw new Error('Tai khoan chua duoc gan cau lac bo hoac vai tro');
      }
      const actor: Actor = {
        sub: token.sub,
        userId: user.id,
        clubId: user.clubId,
        email: token.email,
        name: token.name,
        roles: [user.role],
      };

      client.data.actor = actor;
      client.data.userId = user.id;
      client.data.clubId = user.clubId;

      await client.join(`user:${user.id}`);
      // Room theo club: multi-tenancy phai song ca o tang socket,
      // dung bao gio broadcast ra ca namespace.
      if (user.clubId) await client.join(`club:${user.clubId}`);

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

  handleDisconnect(client: RealtimeSocket): void {
    clearTimeout(client.data.expiry);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToClub(clubId: string, event: string, payload: unknown): void {
    this.server.to(`club:${clubId}`).emit(event, payload);
  }
}
