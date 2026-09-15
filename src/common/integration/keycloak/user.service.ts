import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { AxiosRequestConfig } from 'axios';
import { KeycloakConfig } from './keycloak.config';
import { KeycloakHttpService } from './keycloak-http.service';
import type {
  KeycloakCreateUserParams,
  KeycloakRoleRepresentation,
  KeycloakUserRepresentation,
} from './types/admin';

interface KeycloakAdminTokenResponse {
  access_token: string;
}

@Injectable()
/** Keycloak Admin REST API client. */
export class KeycloakUserService {
  constructor(
    private readonly keycloakConfig: KeycloakConfig,
    private readonly http: KeycloakHttpService,
  ) {}

  async getUserByUsername(
    username: string,
  ): Promise<KeycloakUserRepresentation | null> {
    const users = await this.request<KeycloakUserRepresentation[]>(
      `/admin/realms/${this.keycloakConfig.realmPath}/users?${new URLSearchParams(
        {
          username,
          exact: 'true',
        },
      )}`,
    );
    return users[0] ?? null;
  }

  getUserById(userId: string): Promise<KeycloakUserRepresentation> {
    return this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
    );
  }

  async getAdminToken(): Promise<string> {
    const response = await this.http.tokenEndpoint<KeycloakAdminTokenResponse>({
      grant_type: 'client_credentials',
      ...this.keycloakConfig.clientCredentials(),
    });
    return response.access_token;
  }

  resetUserPassword(userId: string, password: string): Promise<void> {
    return this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: 'PUT',
        data: {
          type: 'password',
          value: password,
          temporary: false,
        },
      },
    );
  }

  async setUserEmailVerified(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        data: {
          ...user,
          emailVerified: true,
          requiredActions: (user.requiredActions ?? []).filter(
            (action) => action !== 'VERIFY_EMAIL',
          ),
        },
      },
    );
  }

  /** @Access() doc role tu TOKEN, nen user khong co realm role se bi 403. */
  /** POST /admin/realms/{realm}/users. Tra ve id cua user vua tao. */
  async registerUserWithPassword(
    params: KeycloakCreateUserParams,
  ): Promise<string> {
    const adminToken = await this.getAdminToken();
    const response = await this.http.request<void>({
      url: `/admin/realms/${this.keycloakConfig.realmPath}/users`,
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      data: {
        username: params.username,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        enabled: true,
        emailVerified: false,
        credentials: [
          { type: 'password', value: params.password, temporary: false },
        ],
      },
      // 409 khong nem: doi thanh ConflictException co nghia cho nguoi goi.
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 409,
    });
    if (response.status === 409)
      throw new ConflictException('Keycloak user already exists');

    // Keycloak tra id moi trong header Location; khong co thi tim lai theo username.
    const location = response.headers.location as string | undefined;
    if (location) return location.split('/').pop() ?? '';

    const found = await this.getUserByUsername(params.username);
    if (!found?.id)
      throw new BadGatewayException('Keycloak did not return the new user id');
    return found.id;
  }

  /** Gui mail yeu cau user tu xac minh. Nguoc voi setUserEmailVerified(). */
  async sendVerifyEmail(userId: string): Promise<void> {
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/execute-actions-email`,
      { method: 'PUT', data: ['VERIFY_EMAIL'] },
    );
  }

  async assignRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.request<KeycloakRoleRepresentation>(
      `/admin/realms/${this.keycloakConfig.realmPath}/roles/${encodeURIComponent(roleName)}`,
    );
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: 'POST', data: [{ id: role.id, name: role.name }] },
    );
  }

  async removeRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.request<KeycloakRoleRepresentation>(
      `/admin/realms/${this.keycloakConfig.realmPath}/roles/${encodeURIComponent(roleName)}`,
    );
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: 'DELETE', data: [{ id: role.id, name: role.name }] },
    );
  }

  /** Tat tai khoan: refresh token con song cung khong cap moi duoc. */
  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
      { method: 'PUT', data: { enabled } },
    );
  }

  /** Hanh dong bu khi tao row local that bai. 404 coi nhu da xoa roi. */
  async deleteUser(userId: string): Promise<void> {
    const token = await this.getAdminToken();
    await this.http.request<void>({
      url: `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 404,
    });
  }

  private async request<T = void>(
    path: string,
    config: AxiosRequestConfig = {},
  ): Promise<T> {
    const token = await this.getAdminToken();
    return this.fetchJson<T>(path, {
      ...config,
      headers: {
        ...config.headers,
        authorization: `Bearer ${token}`,
      },
    });
  }

  private async fetchJson<T>(
    path: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.http.request<T>({ url: path, ...config });
    if (response.status === 204) return undefined as T;
    return response.data;
  }
}
