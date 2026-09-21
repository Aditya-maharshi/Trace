export async function register() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEMO_MODE === 'true') throw new Error('DEMO_MODE is true in production');
    const requiredSecrets = ['SUPABASE_JWT_SECRET', 'AUTOMATION_SECRET', 'CRON_SECRET'];
    for (const secret of requiredSecrets) {
      if (!process.env[secret]) {
        console.error(`[CRITICAL] Missing required secret in production: ${secret}`);
        // We log loudly. Throwing inside instrumentation might be caught by next.js, but it's the standard way to refuse boot.
        throw new Error(`Missing required secret: ${secret}`);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import("./lib/domains/core/sentry");
    initSentry();
  }
}
