# Secret Rotation Runbook

This document outlines the zero-downtime procedures for rotating critical credentials in the Trace application. 

## 1. Supabase Credentials (JWT Secrets, DB Passwords)
To rotate the Supabase JWT secret or Database Password without dropping active user sessions:
1. Generate a new strong secret/password in the Lovable Cloud / Supabase Dashboard.
2. In your application environment settings (Vercel/Render), inject the new secret into `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.
3. Deploy the application to ensure the new environment variables take effect.
4. If using custom edge functions, ensure they are redeployed with the updated secrets.

## 2. API Keys (Etherscan, Gemini, OpenSanctions, Stripe)
Third-party API keys can be rotated independently of the deployment lifecycle.
1. Generate a new API key in the respective provider's dashboard.
2. Update the environment variable (e.g., `ETHERSCAN_API_KEY`) in your hosting platform.
3. Restart or trigger a re-deploy of the `apps/api` (Backend) service.
4. **Validation:** Monitor logs for 401 Unauthorized errors to ensure the new key has propagated fully before revoking the old key in the provider's dashboard.

## 3. Lovable Cron Secret
The `LOVABLE_CRON_SECRET` uses a graceful rollover mechanism (`LOVABLE_CRON_SECRET_PREVIOUS`) to prevent dropped scheduled tasks during rotation.
1. Generate a new secret string.
2. Move the current `LOVABLE_CRON_SECRET` value into `LOVABLE_CRON_SECRET_PREVIOUS`.
3. Set `LOVABLE_CRON_SECRET` to your newly generated secret.
4. Deploy `apps/web`.
5. Update the external cron scheduler (e.g., GitHub Actions, Vercel Cron) to send the new secret in its `Authorization` header.
6. Once the cron has executed successfully with the new secret, you may optionally clear `LOVABLE_CRON_SECRET_PREVIOUS` on the next deployment.

## 4. Git History Scrubbing
If secrets are ever accidentally committed to the Git repository, standard rotation is insufficient. You must:
1. Immediately revoke the exposed secrets at their respective providers.
2. Coordinate with DevOps/Aditya to rewrite the Git history using `git filter-repo` to scrub the exposed secrets from the commit tree.
3. Force-push the rewritten history and notify all developers to pull a fresh clone to avoid reintroducing the secrets.
