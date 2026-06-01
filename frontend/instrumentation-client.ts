import * as Sentry from "@sentry/nextjs";

import { sanitizeSentryEvent } from "./lib/sentry-sanitize";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0");

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    beforeSend: sanitizeSentryEvent,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
