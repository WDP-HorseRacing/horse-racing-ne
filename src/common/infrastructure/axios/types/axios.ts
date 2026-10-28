import type { CreateAxiosDefaults } from 'axios';

export interface AxiosCreateParams {
  key: string;
  config?: CreateAxiosDefaults;
  retry?: Partial<AxiosRetryOptions>;
}

export interface AxiosRetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
