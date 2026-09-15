import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type { AxiosCreateParams, AxiosRetryOptions } from './types/axios';
import { computeRetryDelayWithJitter } from './utils/compute-retry-delay';

/**
 * Registry cac AxiosInstance dung chung, memo theo `key`.
 * Moi he thong ngoai (keycloak, s3, payment...) lay instance cua minh o day.
 */
@Injectable()
export class AxiosService {
  private readonly instances = new Map<string, AxiosInstance>();

  constructor(private readonly config: ConfigService) {}

  create({ key, config, retry }: AxiosCreateParams): AxiosInstance {
    const existing = this.instances.get(key);
    if (existing) return existing;

    const instance = axios.create({
      ...config,
      timeout: config?.timeout ?? this.number('AXIOS_TIMEOUT_MS', 10_000),
    });
    this.addRetry(instance, {
      retries: retry?.retries ?? this.number('AXIOS_RETRY_COUNT', 3),
      baseDelayMs:
        retry?.baseDelayMs ?? this.number('AXIOS_RETRY_BASE_DELAY_MS', 250),
      maxDelayMs:
        retry?.maxDelayMs ?? this.number('AXIOS_RETRY_MAX_DELAY_MS', 5_000),
    });
    this.instances.set(key, instance);
    return instance;
  }

  get(key: string): AxiosInstance | undefined {
    return this.instances.get(key);
  }

  remove(key: string): boolean {
    return this.instances.delete(key);
  }

  private addRetry(instance: AxiosInstance, options: AxiosRetryOptions): void {
    axiosRetry(instance, {
      retries: options.retries,
      shouldResetTimeout: true,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error),
      retryDelay: (retryCount) =>
        computeRetryDelayWithJitter({
          retryCount,
          baseDelayMs: options.baseDelayMs,
          maxDelayMs: options.maxDelayMs,
        }),
    });
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
