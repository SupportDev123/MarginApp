/**
 * API Monitoring & Metrics
 * 
 * Tracks success rates, failures, and latency for each API integration.
 * Enables real-time alerting when thresholds are exceeded.
 */

export type ApiName = 'ebay' | 'openai' | 'serpapi' | 'stripe' | 'google' | 'database';

interface ApiMetrics {
  success: number;
  failed: number;
  totalLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  lastError?: {
    message: string;
    timestamp: number;
    code?: string;
  };
  lastSuccessTimestamp: number;
  lastFailureTimestamp: number;
}

class MonitoringService {
  private metrics: Map<ApiName, ApiMetrics> = new Map();
  private thresholds = {
    failureRatePercent: 10, // Alert if >10% of requests fail
    maxConsecutiveFailures: 5, // Alert if 5+ consecutive failures
    unavailableMinutes: 5, // Alert if API unavailable for 5+ min
  };

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const apis: ApiName[] = ['ebay', 'openai', 'serpapi', 'stripe', 'google', 'database'];
    for (const api of apis) {
      this.metrics.set(api, {
        success: 0,
        failed: 0,
        totalLatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        lastSuccessTimestamp: Date.now(),
        lastFailureTimestamp: 0,
      });
    }
  }

  /**
   * Record successful API call
   */
  recordSuccess(api: ApiName, latencyMs: number): void {
    const metric = this.metrics.get(api)!;
    metric.success++;
    metric.totalLatencyMs += latencyMs;
    metric.minLatencyMs = Math.min(metric.minLatencyMs, latencyMs);
    metric.maxLatencyMs = Math.max(metric.maxLatencyMs, latencyMs);
    metric.lastSuccessTimestamp = Date.now();
    metric.lastError = undefined;

    this.checkAlerts(api);
  }

  /**
   * Record failed API call
   */
  recordFailure(api: ApiName, error: Error | string, code?: string): void {
    const metric = this.metrics.get(api)!;
    metric.failed++;
    metric.lastFailureTimestamp = Date.now();
    metric.lastError = {
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      code,
    };

    this.checkAlerts(api);
  }

  /**
   * Get current metrics for an API
   */
  getMetrics(api: ApiName) {
    const metric = this.metrics.get(api)!;
    const total = metric.success + metric.failed;
    const failureRate = total > 0 ? (metric.failed / total) * 100 : 0;
    const avgLatencyMs = metric.success > 0 ? metric.totalLatencyMs / metric.success : 0;

    return {
      ...metric,
      totalRequests: total,
      successRate: total > 0 ? ((metric.success / total) * 100).toFixed(1) : '100',
      failureRate: failureRate.toFixed(1),
      avgLatencyMs: Math.round(avgLatencyMs),
      isHealthy: failureRate < this.thresholds.failureRatePercent,
      isUnavailable:
        Date.now() - metric.lastSuccessTimestamp > this.thresholds.unavailableMinutes * 60 * 1000,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result: Record<string, any> = {};
    const apis: ApiName[] = ['ebay', 'openai', 'serpapi', 'stripe', 'google', 'database'];
    for (const api of apis) {
      result[api] = this.getMetrics(api);
    }
    return result;
  }

  /**
   * Get health status for all APIs
   */
  getHealthStatus() {
    const result: Record<string, any> = {};
    const apis: ApiName[] = ['ebay', 'openai', 'serpapi', 'stripe', 'google', 'database'];
    for (const api of apis) {
      const metrics = this.getMetrics(api);
      const failureRate = parseFloat(metrics.failureRate);
      
      let status = 'healthy';
      if (metrics.isUnavailable) {
        status = 'down';
      } else if (failureRate > this.thresholds.failureRatePercent) {
        status = 'degraded';
      }
      
      result[api] = {
        status,
        failureRate: failureRate.toFixed(1) + '%',
        avgLatencyMs: metrics.avgLatencyMs,
        totalRequests: metrics.totalRequests,
      };
    }
    return result;
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus() {
    const lines: string[] = [];
    const apis: ApiName[] = ['ebay', 'openai', 'serpapi', 'stripe', 'google', 'database'];
    
    for (const api of apis) {
      const metrics = this.getMetrics(api);
      lines.push(`# HELP api_calls_total Total API calls`);
      lines.push(`api_calls_total{service="${api}"} ${metrics.totalRequests}`);
      lines.push(`api_calls_success{service="${api}"} ${metrics.success}`);
      lines.push(`api_calls_failed{service="${api}"} ${metrics.failed}`);
      lines.push(`api_call_duration_ms{service="${api}",percentile="avg"} ${metrics.avgLatencyMs}`);
      lines.push(`api_failure_rate{service="${api}"} ${parseFloat(metrics.failureRate)}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Check if alerts should be triggered
   */
  private checkAlerts(api: ApiName): void {
    const metrics = this.getMetrics(api);

    // Alert: High failure rate
    if (parseFloat(metrics.failureRate) > this.thresholds.failureRatePercent) {
      this.sendAlert(
        `⚠️ ${api.toUpperCase()} HIGH FAILURE RATE`,
        `${metrics.failureRate}% of requests are failing (threshold: ${this.thresholds.failureRatePercent}%)`,
        'warning'
      );
    }

    // Alert: API unavailable
    if (metrics.isUnavailable) {
      this.sendAlert(
        `🚨 ${api.toUpperCase()} UNAVAILABLE`,
        `No successful requests for ${this.thresholds.unavailableMinutes}+ minutes`,
        'critical'
      );
    }

    // Alert: Slow API
    if (metrics.avgLatencyMs > 5000) {
      this.sendAlert(
        `⏱️ ${api.toUpperCase()} SLOW`,
        `Average latency is ${metrics.avgLatencyMs}ms (high threshold)`,
        'warning'
      );
    }
  }

  /**
   * Send alert to monitoring system
   * TODO: Integrate with Slack, PagerDuty, DataDog, etc.
   */
  private sendAlert(title: string, message: string, severity: 'info' | 'warning' | 'critical'): void {
    const timestamp = new Date().toISOString();

    // For now, just log to console. In production, send to monitoring service.
    const output = `[${timestamp}] [${severity.toUpperCase()}] ${title}: ${message}`;

    if (severity === 'critical') {
      console.error(output);
      // TODO: Send to PagerDuty or critical alert channel
    } else if (severity === 'warning') {
      console.warn(output);
      // TODO: Send to Slack #alerts channel
    } else {
      console.log(output);
    }
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(api?: ApiName): void {
    if (api) {
      this.metrics.set(api, {
        success: 0,
        failed: 0,
        totalLatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        lastSuccessTimestamp: Date.now(),
        lastFailureTimestamp: 0,
      });
    } else {
      this.initializeMetrics();
    }
  }

  /**
   * Export metrics for Prometheus, DataDog, etc.
   */
  exportPrometheus(): string {
    const apis: ApiName[] = ['ebay', 'openai', 'serpapi', 'stripe', 'google', 'database'];
    let output = '';

    for (const api of apis) {
      const m = this.getMetrics(api);
      output += `# HELP api_requests_total Total API requests\n`;
      output += `api_requests_total{api="${api}"} ${m.totalRequests}\n`;
      output += `api_requests_success{api="${api}"} ${m.success}\n`;
      output += `api_requests_failed{api="${api}"} ${m.failed}\n`;
      output += `api_latency_ms{api="${api}",type="avg"} ${m.avgLatencyMs}\n`;
      output += `api_latency_ms{api="${api}",type="min"} ${m.minLatencyMs}\n`;
      output += `api_latency_ms{api="${api}",type="max"} ${m.maxLatencyMs}\n`;
      output += `api_health{api="${api}"} ${m.isHealthy ? 1 : 0}\n`;
      output += `\n`;
    }

    return output;
  }
}

// Export singleton
export const monitoring = new MonitoringService();

/**
 * Wrapper to track API latency
 */
export async function trackApiCall<T>(
  api: ApiName,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const latency = Date.now() - startTime;
    monitoring.recordSuccess(api, latency);
    return result;
  } catch (error) {
    const code = (error as any)?.code || (error as any)?.statusCode || 'unknown';
    monitoring.recordFailure(api, error as Error, String(code));
    throw error;
  }
}
