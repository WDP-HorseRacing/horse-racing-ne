import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { AxiosService } from '../axios/axios.service';
import { KeycloakConfig } from './keycloak.config';

/**
 * Tạo câu lỗi 502 khi Keycloak trả lời bằng một mã lỗi HTTP
 *
 * @param status Mã HTTP Keycloak trả về
 * @returns Câu báo lỗi tiếng Việt kèm mã
 */
export function keycloakFailureMessage(status: number): string {
  return `Máy chủ xác thực báo lỗi (mã ${status})`;
}

@Injectable()
export class KeycloakHttpService {
  constructor(
    private readonly keycloakConfig: KeycloakConfig,
    private readonly axiosService: AxiosService,
  ) {}

  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    try {
      return await this.client().request<T>(config);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Keycloak co tra loi, nhung la loi. Loi cua he thong phia sau -> 502.
        throw new BadGatewayException(
          keycloakFailureMessage(error.response.status),
          { cause: error.response.data },
        );
      }
      // Timeout, DNS hong, connection refused: khong voi toi duoc -> 503.
      throw new ServiceUnavailableException('Không kết nối được Keycloak');
    }
  }

  async tokenEndpoint<T>(values: Record<string, string>): Promise<T> {
    const response = await this.request<T>({
      url: this.keycloakConfig.tokenEndpoint,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams(values),
    });
    return response.data;
  }

  private client() {
    return this.axiosService.create({
      key: 'keycloak',
      config: { baseURL: this.keycloakConfig.authServerUrl },
    });
  }
}
