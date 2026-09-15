import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Noi duy nhat trong thu muc nay cham vao ConfigService.
 * Project nay dung env phang, nen ta gom lai o day: doi sang namespace sau nay
 * chi phai sua dung mot file.
 */
@Injectable()
export class KeycloakConfig {
  constructor(private readonly config: ConfigService) {}

  /** Da duoc validateEnvironment cat dau "/" o cuoi. */
  get authServerUrl(): string {
    return this.config.getOrThrow<string>('KEYCLOAK_AUTH_SERVER_URL');
  }

  get realm(): string {
    return this.config.getOrThrow<string>('KEYCLOAK_REALM');
  }

  /** Realm da encode, dung khi ghep vao duong dan request. */
  get realmPath(): string {
    return encodeURIComponent(this.realm);
  }

  get clientId(): string {
    return this.config.getOrThrow<string>('KEYCLOAK_CLIENT_ID');
  }

  get clientSecret(): string {
    return this.config.getOrThrow<string>('KEYCLOAK_SECRET');
  }

  /** Chuoi `iss` chinh xac ma Keycloak dong len token cua realm nay. */
  get issuer(): string {
    return `${this.authServerUrl}/realms/${this.realm}`;
  }

  get jwksUri(): string {
    return `${this.issuer}/protocol/openid-connect/certs`;
  }

  get tokenEndpoint(): string {
    return `/realms/${this.realmPath}/protocol/openid-connect/token`;
  }

  /** Chi luong redirect trinh duyet moi can. */
  get redirectUri(): string {
    const value = this.config.get<string>('KEYCLOAK_REDIRECT_URI');
    if (!value) {
      throw new ServiceUnavailableException(
        'KEYCLOAK_REDIRECT_URI chua duoc cau hinh',
      );
    }
    return value;
  }

  /** Thong tin dang nhap cua client, dung cho moi lenh goi token endpoint. */
  clientCredentials(): Record<string, string> {
    return { client_id: this.clientId, client_secret: this.clientSecret };
  }
}
