import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  integrations: [Sentry.replayIntegration()],
  // Session Replay: error-triggered only.
  //
  // next.config.ts sets `tunnelRoute: "/monitoring"`, so every Sentry envelope
  // is proxied through our OWN serverless function rather than going straight
  // to Sentry. Continuous session recording is the expensive shape for that:
  // a sampled session uploads replay segments every few seconds for its whole
  // duration, and each one costs a function invocation that buffers the
  // payload and re-POSTs it. Sampling 10% of ALL sessions meant paying that
  // for sessions where nothing ever went wrong.
  //
  // Setting this to 0 keeps the replay buffer running in memory and uploads it
  // only when an error actually fires, which is the part that has debugging
  // value. The tunnel itself stays: this app's users demonstrably run content
  // blockers (the whole realtime polling fallback exists because they cannot
  // reach *.supabase.co), and those same blockers eat sentry.io directly, so
  // removing the tunnel would blind us to errors from exactly the users most
  // likely to hit them.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

// Hook into App Router navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
