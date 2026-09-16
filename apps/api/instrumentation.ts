export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import("./lib/domains/core/sentry");
    initSentry();
  }
}
