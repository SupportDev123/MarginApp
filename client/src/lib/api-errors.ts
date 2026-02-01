/**
 * API Error Handler
 * Provides user-friendly error messages for common API failures
 */

export interface ApiErrorInfo {
  title: string;
  message: string;
  suggestion: string;
  retryable: boolean;
}

export function parseApiError(error: Error | unknown): ApiErrorInfo {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  // Daily scan limit reached
  if (errorMessage.includes('daily scan limit') || errorMessage.includes('scan limit reached')) {
    return {
      title: "Daily Limit Reached",
      message: "You've used all 5 free scans today.",
      suggestion: "Upgrade to Pro for unlimited scans, or come back tomorrow!",
      retryable: false,
    };
  }
  
  // Rate limiting
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests') || errorMessage.includes('429')) {
    return {
      title: "Too Many Requests",
      message: "Our servers are busy processing your requests.",
      suggestion: "Please wait a moment and try again.",
      retryable: true,
    };
  }
  
  // OpenAI/AI service failures
  if (errorMessage.includes('openai') || errorMessage.includes('ai service') || errorMessage.includes('vision')) {
    return {
      title: "AI Service Temporarily Unavailable",
      message: "Our image analysis service is experiencing issues.",
      suggestion: "Try again in a few seconds, or try a different image.",
      retryable: true,
    };
  }
  
  // SerpAPI/eBay API failures
  if (errorMessage.includes('serpapi') || errorMessage.includes('ebay') || errorMessage.includes('sold listings')) {
    return {
      title: "Price Data Temporarily Unavailable",
      message: "We couldn't fetch sold listing data right now.",
      suggestion: "Try again in a moment, or use Research Mode to select your own comps.",
      retryable: true,
    };
  }
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
    return {
      title: "Connection Issue",
      message: "We couldn't reach our servers.",
      suggestion: "Check your internet connection and try again.",
      retryable: true,
    };
  }
  
  // Image processing errors
  if (errorMessage.includes('image') || errorMessage.includes('photo') || errorMessage.includes('camera')) {
    return {
      title: "Image Processing Issue",
      message: "We had trouble analyzing that image.",
      suggestion: "Try taking a clearer photo with better lighting.",
      retryable: true,
    };
  }
  
  // No comps found
  if (errorMessage.includes('no comps') || errorMessage.includes('no sold') || errorMessage.includes('insufficient data')) {
    return {
      title: "Not Enough Sales Data",
      message: "We couldn't find enough recent sales to price this item accurately.",
      suggestion: "Try Open Market Search to manually select comparable sales.",
      retryable: false,
    };
  }
  
  // Generic server error
  if (errorMessage.includes('500') || errorMessage.includes('server error') || errorMessage.includes('internal')) {
    return {
      title: "Server Issue",
      message: "Something went wrong on our end.",
      suggestion: "Please try again in a few moments.",
      retryable: true,
    };
  }
  
  // Default fallback
  return {
    title: "Something Went Wrong",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
    suggestion: "Please try again. If the problem persists, try a different approach.",
    retryable: true,
  };
}

export function getUserFriendlyErrorMessage(error: Error | unknown): string {
  const info = parseApiError(error);
  return `${info.message} ${info.suggestion}`;
}
