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

/**
 * Client for the Keycloak Admin REST API that manages realm users
 */
@Injectable()
export class KeycloakUserService {
  constructor(
    private readonly keycloakConfig: KeycloakConfig,
    private readonly http: KeycloakHttpService,
  ) {}

  /**
   * Find a Keycloak user by exact username
   * @param username The username to search for
   * @returns A promise resolving to the user, or null if not found
   */
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

  /**
   * Get a Keycloak user by id
   * @param userId The Keycloak ID of the user
   * @returns A promise resolving to the user
   */
  getUserById(userId: string): Promise<KeycloakUserRepresentation> {
    return this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
    );
  }

  /**
   * Get an admin access token using the client credentials grant
   * @returns A promise resolving to the access token
   */
  async getAdminToken(): Promise<string> {
    const response = await this.http.tokenEndpoint<KeycloakAdminTokenResponse>({
      grant_type: 'client_credentials',
      ...this.keycloakConfig.clientCredentials(),
    });
    return response.access_token;
  }

  /**
   * Set a new permanent password for a user, without revoking existing refresh tokens
   * @param userId The Keycloak ID of the user
   * @param password The new password
   * @returns A promise resolving once the password is reset
   */
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

  /**
   * Mark a user's email as verified and drop the VERIFY_EMAIL required action
   * @param userId The Keycloak ID of the user
   * @returns A promise resolving once the user is updated
   */
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

  /**
   * Create an enabled user with a permanent password, without any realm role
   * @param params The username, email, name, and password of the user
   * @returns A promise resolving to the Keycloak ID of the created user, read from the Location header or looked up by username
   * @throws ConflictException if the user already exists in Keycloak
   * @throws BadGatewayException if Keycloak does not return the new user id
   */
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
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 409,
    });
    if (response.status === 409)
      throw new ConflictException('Keycloak user already exists');

    const location = response.headers.location as string | undefined;
    if (location) return location.split('/').pop() ?? '';

    const found = await this.getUserByUsername(params.username);
    if (!found?.id)
      throw new BadGatewayException('Keycloak did not return the new user id');
    return found.id;
  }

  /**
   * Send an email asking the user to verify their address
   * @param userId The Keycloak ID of the user
   * @returns A promise resolving once the email is requested
   */
  async sendVerifyEmail(userId: string): Promise<void> {
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/execute-actions-email`,
      { method: 'PUT', data: ['VERIFY_EMAIL'] },
    );
  }

  /**
   * Assign a realm role to a user
   * @param userId The Keycloak ID of the user
   * @param roleName The name of the realm role
   * @returns A promise resolving once the role is assigned
   */
  async assignRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.request<KeycloakRoleRepresentation>(
      `/admin/realms/${this.keycloakConfig.realmPath}/roles/${encodeURIComponent(roleName)}`,
    );
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: 'POST', data: [{ id: role.id, name: role.name }] },
    );
  }

  /**
   * Remove a realm role from a user
   * @param userId The Keycloak ID of the user
   * @param roleName The name of the realm role
   * @returns A promise resolving once the role is removed
   */
  async removeRealmRole(userId: string, roleName: string): Promise<void> {
    const role = await this.request<KeycloakRoleRepresentation>(
      `/admin/realms/${this.keycloakConfig.realmPath}/roles/${encodeURIComponent(roleName)}`,
    );
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: 'DELETE', data: [{ id: role.id, name: role.name }] },
    );
  }

  /**
   * Enable or disable a user, which also blocks refreshing existing tokens when disabled
   * @param userId The Keycloak ID of the user
   * @param enabled Whether the user is enabled
   * @returns A promise resolving once the user is updated
   */
  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}`,
      { method: 'PUT', data: { enabled } },
    );
  }

  /**
   * End all sessions of a user, required after a password or role change to revoke old refresh tokens
   * @param userId The Keycloak ID of the user
   * @returns A promise resolving once the sessions are ended
   */
  async logoutUser(userId: string): Promise<void> {
    await this.request(
      `/admin/realms/${this.keycloakConfig.realmPath}/users/${encodeURIComponent(userId)}/logout`,
      { method: 'POST' },
    );
  }

  /**
   * Delete a user, treating a missing user as already deleted
   * @param userId The Keycloak ID of the user
   * @returns A promise resolving once the user is deleted
   */
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

  /**
   * Send an authenticated request to the Keycloak Admin REST API
   * @param path The request path
   * @param config The Axios request config
   * @returns A promise resolving to the response body
   */
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

  /**
   * Send a request and return its body, or undefined for a 204 response
   * @param path The request path
   * @param config The Axios request config
   * @returns A promise resolving to the response body
   */
  private async fetchJson<T>(
    path: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.http.request<T>({ url: path, ...config });
    if (response.status === 204) return undefined as T;
    return response.data;
  }
}
