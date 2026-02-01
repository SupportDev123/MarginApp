/**
 * Error Handling & User Messaging System
 * 
 * Maps internal errors to user-friendly messages and HTTP status codes.
 * Enables monitoring and proper error tracking.
 */

export enum ErrorCode {
  // API Errors
  EBAY_RATE_LIMIT = 'EBAY_RATE_LIMIT',
  EBAY_UNAVAILABLE = 'EBAY_UNAVAILABLE',
  OPENAI_RATE_LIMIT = 'OPENAI_RATE_LIMIT',
  OPENAI_TIMEOUT = 'OPENAI_TIMEOUT',
  OPENAI_UNAVAILABLE = 'OPENAI_UNAVAILABLE',
  SERPAPI_RATE_LIMIT = 'SERPAPI_RATE_LIMIT',
  STRIPE_UNAVAILABLE = 'STRIPE_UNAVAILABLE',
  GOOGLE_SEARCH_FAILED = 'GOOGLE_SEARCH_FAILED',

  // Database Errors
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  DATABASE_QUERY_FAILED = 'DATABASE_QUERY_FAILED',

  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',

  // Auth Errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Generic
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

interface UserMessage {
  title: string;
  message: string;
  action?: string; // What user should do
  retryAfterSeconds?: number;
}

/**
 * Map error codes to user-friendly messages
 */
const USER_MESSAGES: Record<ErrorCode, UserMessage> = {
  // API Errors - Rate Limits
  [ErrorCode.EBAY_RATE_LIMIT]: {
    title: 'eBay is busy',
    message: 'eBay search is temporarily busy. We\'re using recent market data instead.',
    action: 'Try again in a few minutes for the latest listings.',
    retryAfterSeconds: 300,
  },
  [ErrorCode.OPENAI_RATE_LIMIT]: {
    title: 'AI service is busy',
    message: 'Our AI identification service is handling a lot of requests.',
    action: 'We\'ll use a quick analysis instead. Full AI details will update shortly.',
    retryAfterSeconds: 60,
  },
  [ErrorCode.SERPAPI_RATE_LIMIT]: {
    title: 'Search service is busy',
    message: 'Our comparison search is temporarily busy.',
    action: 'We\'re using cached market data. Refresh in a minute for the latest.',
    retryAfterSeconds: 60,
  },

  // API Errors - Unavailable
  [ErrorCode.EBAY_UNAVAILABLE]: {
    title: 'eBay temporarily unavailable',
    message: 'We can\'t reach eBay right now. We\'re using recent sold listings instead.',
    action: 'Check back in a moment for live data.',
    retryAfterSeconds: 300,
  },
  [ErrorCode.OPENAI_UNAVAILABLE]: {
    title: 'AI service temporarily down',
    message: 'Our AI identification service is unavailable.',
    action: 'You can manually review the item details or try again in a few minutes.',
    retryAfterSeconds: 300,
  },
  [ErrorCode.STRIPE_UNAVAILABLE]: {
    title: 'Payment service unavailable',
    message: 'We\'re having trouble processing payments right now.',
    action: 'Your item has been saved. Please try paying again in a moment.',
    retryAfterSeconds: 300,
  },

  // Timeouts
  [ErrorCode.OPENAI_TIMEOUT]: {
    title: 'AI service is slow',
    message: 'AI analysis is taking longer than usual.',
    action: 'Manual verification recommended. You can also wait for AI results.',
    retryAfterSeconds: undefined,
  },

  // Other API Errors
  [ErrorCode.GOOGLE_SEARCH_FAILED]: {
    title: 'Search failed',
    message: 'We couldn\'t complete the search.',
    action: 'Try again or provide item details manually.',
    retryAfterSeconds: 60,
  },

  // Database Errors
  [ErrorCode.DATABASE_CONNECTION_FAILED]: {
    title: 'Server connection issue',
    message: 'We\'re having trouble connecting to our database.',
    action: 'Please refresh the page.',
    retryAfterSeconds: 30,
  },
  [ErrorCode.DATABASE_QUERY_FAILED]: {
    title: 'Data access failed',
    message: 'We couldn\'t retrieve the data you requested.',
    action: 'Please try again.',
    retryAfterSeconds: 10,
  },

  // Validation Errors
  [ErrorCode.INVALID_INPUT]: {
    title: 'Invalid input',
    message: 'The information you provided isn\'t valid.',
    action: 'Please check your input and try again.',
  },
  [ErrorCode.MISSING_REQUIRED_FIELD]: {
    title: 'Missing information',
    message: 'Please provide all required information.',
    action: 'Fill out all fields and try again.',
  },
  [ErrorCode.ITEM_NOT_FOUND]: {
    title: 'Item not found',
    message: 'We couldn\'t find that item.',
    action: 'Double-check the item ID or upload a new image.',
  },

  // Auth Errors
  [ErrorCode.UNAUTHORIZED]: {
    title: 'Please log in',
    message: 'You need to log in to do this.',
    action: 'Log in and try again.',
  },
  [ErrorCode.FORBIDDEN]: {
    title: 'Access denied',
    message: 'You don\'t have permission to do this.',
    action: 'Contact support if you think this is a mistake.',
  },

  // Generic
  [ErrorCode.INTERNAL_ERROR]: {
    title: 'Something went wrong',
    message: 'We\'re experiencing a temporary issue.',
    action: 'Please try again in a moment.',
    retryAfterSeconds: 10,
  },
};

/**
 * Map error codes to HTTP status codes and retry behavior
 */
const ERROR_PROPERTIES: Record<ErrorCode, { statusCode: number; isRetryable: boolean }> = {
  [ErrorCode.EBAY_RATE_LIMIT]: { statusCode: 429, isRetryable: true },
  [ErrorCode.EBAY_UNAVAILABLE]: { statusCode: 503, isRetryable: true },
  [ErrorCode.OPENAI_RATE_LIMIT]: { statusCode: 429, isRetryable: true },
  [ErrorCode.OPENAI_TIMEOUT]: { statusCode: 504, isRetryable: true },
  [ErrorCode.OPENAI_UNAVAILABLE]: { statusCode: 503, isRetryable: true },
  [ErrorCode.SERPAPI_RATE_LIMIT]: { statusCode: 429, isRetryable: true },
  [ErrorCode.STRIPE_UNAVAILABLE]: { statusCode: 503, isRetryable: true },
  [ErrorCode.GOOGLE_SEARCH_FAILED]: { statusCode: 503, isRetryable: true },
  [ErrorCode.DATABASE_CONNECTION_FAILED]: { statusCode: 503, isRetryable: true },
  [ErrorCode.DATABASE_QUERY_FAILED]: { statusCode: 500, isRetryable: true },
  [ErrorCode.INVALID_INPUT]: { statusCode: 400, isRetryable: false },
  [ErrorCode.MISSING_REQUIRED_FIELD]: { statusCode: 400, isRetryable: false },
  [ErrorCode.ITEM_NOT_FOUND]: { statusCode: 404, isRetryable: false },
  [ErrorCode.UNAUTHORIZED]: { statusCode: 401, isRetryable: false },
  [ErrorCode.FORBIDDEN]: { statusCode: 403, isRetryable: false },
  [ErrorCode.INTERNAL_ERROR]: { statusCode: 500, isRetryable: true },
};

/**
 * Application error with proper context
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public originalError?: Error,
    public context?: Record<string, any>
  ) {
    const message = USER_MESSAGES[code]?.message || 'Something went wrong';
    super(message);
    this.name = 'AppError';
  }

  getUserMessage(): UserMessage {
    return USER_MESSAGES[this.code];
  }

  getStatusCode(): number {
    return ERROR_PROPERTIES[this.code]?.statusCode || 500;
  }

  isRetryable(): boolean {
    return ERROR_PROPERTIES[this.code]?.isRetryable || false;
  }

  toJSON() {
    return {
      code: this.code,
      title: USER_MESSAGES[this.code]?.title,
      message: USER_MESSAGES[this.code]?.message,
      action: USER_MESSAGES[this.code]?.action,
      retryAfterSeconds: USER_MESSAGES[this.code]?.retryAfterSeconds,
      statusCode: this.getStatusCode(),
      isRetryable: this.isRetryable(),
      // Only expose original error details in development
      ...(process.env.NODE_ENV === 'development' && {
        originalError: this.originalError?.message,
        context: this.context,
      }),
    };
  }
}

/**
 * Helper to convert any error to AppError
 */
export function toAppError(error: unknown, defaultCode = ErrorCode.INTERNAL_ERROR): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to infer error code from error message
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return new AppError(ErrorCode.OPENAI_RATE_LIMIT, error);
    }
    if (error.message.includes('timeout') || error.message.includes('504')) {
      return new AppError(ErrorCode.OPENAI_TIMEOUT, error);
    }
    if (error.message.includes('database')) {
      return new AppError(ErrorCode.DATABASE_QUERY_FAILED, error);
    }
    return new AppError(defaultCode, error);
  }

  return new AppError(defaultCode, new Error(String(error)));
}

/**
 * Get all error codes for reference
 */
export function getAllErrorCodes(): Record<string, UserMessage & { statusCode: number; isRetryable: boolean }> {
  const result: any = {};
  for (const code of Object.values(ErrorCode)) {
    if (typeof code === 'string') {
      result[code] = {
        ...USER_MESSAGES[code as ErrorCode],
        statusCode: ERROR_PROPERTIES[code as ErrorCode].statusCode,
        isRetryable: ERROR_PROPERTIES[code as ErrorCode].isRetryable,
      };
    }
  }
  return result;
}
