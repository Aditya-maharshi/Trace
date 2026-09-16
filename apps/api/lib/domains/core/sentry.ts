/**
 * Optional Sentry error tracking.
 *
 * No-ops when SENTRY_DSN is unset so local/dev/test never depend on a vendor.
 * Initialized from instrumentation.ts on Next.js boot.
 */

import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (process.env.NODE_ENV === "test") return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
  });
  initialized = true;
}

export function captureException(
  error: unknown,
  extras?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (extras) {
      scope.setExtras(extras);
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(
  message: string,
  extras?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (extras) {
      scope.setExtras(extras);
    }
    Sentry.captureMessage(message, "error");
  });
}

/** Test helper */
export function resetSentryForTesting(): void {
  initialized = false;
}
