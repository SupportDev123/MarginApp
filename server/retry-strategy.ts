/**
 * Retry Strategy with Exponential Backoff
 * 
 * Handles transient failures (rate limits, timeouts) gracefully.
 * Gives up on permanent failures (validation errors, auth failures) immediately.
 */

import { AppError, ErrorCode, toAppError } from './error-handling';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean; // Add randomness to prevent thundering herd
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  onRetry: () => {},
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const appError = toAppError(error);

      // Don't retry non-retryable errors
      if (!appError.isRetryable()) {
        throw appError;
      }

      // Don't retry after max attempts
      if (attempt === opts.maxRetries) {
        throw appError;
      }

      // Calculate delay with exponential backoff
      let delay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
      delay = Math.min(delay, opts.maxDelayMs);

      // Add jitter (±10% randomness)
      if (opts.jitter) {
        const jitterAmount = delay * 0.1;
        delay += (Math.random() - 0.5) * 2 * jitterAmount;
      }

      opts.onRetry(attempt + 1, delay, lastError);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, Math.round(delay)));
    }
  }

  throw lastError;
}

/**
 * Retry wrapper for API calls with logging
 */
export async function callWithRetry<T>(
  name: string, // For logging: "eBay API", "OpenAI", etc.
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...options,
    onRetry: (attempt, delay, error) => {
      console.warn(
        `[${name}] Retry ${attempt} after ${Math.round(delay)}ms. Error: ${error.message}`
      );
      options.onRetry?.(attempt, delay, error);
    },
  });
}

/**
 * Timeout wrapper - throw OPENAI_TIMEOUT after X milliseconds
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: ErrorCode = ErrorCode.OPENAI_TIMEOUT
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new AppError(errorCode, new Error(`Operation timed out after ${timeoutMs}ms`))),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Retry specific API with predefined configuration
 */
const API_CONFIGS: Record<string, Required<RetryOptions>> = {
  ebay: {
    maxRetries: 5,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: () => {},
  },
  openai: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: () => {},
  },
  serpapi: {
    maxRetries: 4,
    initialDelayMs: 3000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: () => {},
  },
  stripe: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: () => {},
  },
};

export async function callEbayWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return callWithRetry('eBay API', fn, API_CONFIGS.ebay);
}

export async function callOpenAIWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return callWithRetry('OpenAI', fn, API_CONFIGS.openai);
}

export async function callSerpapiWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return callWithRetry('SerpAPI', fn, API_CONFIGS.serpapi);
}

export async function callStripeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return callWithRetry('Stripe', fn, API_CONFIGS.stripe);
}
