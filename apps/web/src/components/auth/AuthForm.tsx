import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ShieldCheck, AlertTriangle } from "lucide-react";
import { AuthBackground } from "./AuthBackground";
import styles from "./auth.module.css";

const STRENGTH_COLORS = ["#ff5c7a", "#f7931a", "#e8d44f", "#2fe3a3"];

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthFallbackProvider, setOauthFallbackProvider] = useState<"google" | "github" | null>(null);
  const [existingSessionEmail, setExistingSessionEmail] = useState<string | null>(null);

  // Derived password strength: 4-segment check (length >= 8, uppercase, number, special character)
  const pwStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : search);

    // 1. If explicitly switching accounts, sign out and clear demo sessions immediately
    if (params.get("switch") === "true") {
      localStorage.removeItem("trace_guest_session");
      localStorage.removeItem("trace_demo_provider");
      supabase.auth.signOut().catch(() => {});
      setExistingSessionEmail(null);
      return;
    }

    // 2. Check if redirected back with an OAuth error in URL hash or search params
    const errorDesc = params.get("error_description");
    const errorMsg = params.get("error");

    if (errorDesc || errorMsg) {
      const decoded = decodeURIComponent(errorDesc || errorMsg || "");
      if (
        decoded.toLowerCase().includes("unsupported provider") ||
        decoded.toLowerCase().includes("missing oauth secret") ||
        decoded.toLowerCase().includes("not enabled")
      ) {
        setError(
          "OAuth provider is not yet enabled in this Supabase project. You can sign in using Email & Password or click Demo Access below.",
        );
        setOauthFallbackProvider("google");
      } else {
        setError(decoded);
      }
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // 3. Clear guest session if visiting login/signup so user can choose their real account
    localStorage.removeItem("trace_guest_session");
    localStorage.removeItem("trace_demo_provider");

    // 4. Check for active Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setExistingSessionEmail(session.user.email);
      }
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setOauthFallbackProvider(null);

    if (isSignup && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    if (isSignup && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        setLoading(false);

        if (authError) {
          setError(authError.message);
          return;
        }

        if (authData.session) {
          navigate({ to: "/dashboard" });
        } else {
          setSuccessMsg(
            "Account created! Please check your email inbox to confirm your address before logging in.",
          );
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        setLoading(false);

        if (authError) {
          setError(authError.message);
          return;
        }

        if (authData.session) {
          navigate({ to: "/dashboard" });
        }
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    }
  }

  async function handleGoogle() {
    setError(null);
    setSuccessMsg(null);
    setOauthFallbackProvider(null);
    setLoading(true);

    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
        },
      });

      if (oauthError) {
        setLoading(false);
        setError(
          "Google sign-in is not yet configured in this Supabase project (missing OAuth client ID/secret in Supabase Dashboard).",
        );
        setOauthFallbackProvider("google");
        return;
      }

      if (data?.url) {
        // Pre-flight check: verify if the OAuth provider is enabled before browser leaves page
        try {
          const check = await fetch(data.url, { method: "GET" });
          if (!check.ok) {
            const errData = await check.json().catch(() => ({}));
            const msg = (errData.msg || errData.message || "").toLowerCase();
            if (
              msg.includes("missing oauth secret") ||
              msg.includes("unsupported provider") ||
              msg.includes("not enabled")
            ) {
              setLoading(false);
              setError(
                "Google OAuth is not enabled in this Supabase project (missing Client ID/Secret in Supabase Dashboard).",
              );
              setOauthFallbackProvider("google");
              return;
            }
          }
        } catch {
          // If browser policy prevents reading preflight response, proceed with standard navigation
        }

        window.location.href = data.url;
      } else {
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to initiate Google sign-in.");
      setOauthFallbackProvider("google");
    }
  }

  async function handleGithub() {
    setError(null);
    setSuccessMsg(null);
    setOauthFallbackProvider(null);
    setLoading(true);

    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (oauthError) {
        setLoading(false);
        setError(
          "GitHub sign-in is not yet configured in this Supabase project (missing OAuth client ID/secret in Supabase Dashboard).",
        );
        setOauthFallbackProvider("github");
        return;
      }

      if (data?.url) {
        // Pre-flight check: verify if the OAuth provider is enabled before browser leaves page
        try {
          const check = await fetch(data.url, { method: "GET" });
          if (!check.ok) {
            const errData = await check.json().catch(() => ({}));
            const msg = (errData.msg || errData.message || "").toLowerCase();
            if (
              msg.includes("missing oauth secret") ||
              msg.includes("unsupported provider") ||
              msg.includes("not enabled")
            ) {
              setLoading(false);
              setError(
                "GitHub OAuth is not enabled in this Supabase project (missing Client ID/Secret in Supabase Dashboard).",
              );
              setOauthFallbackProvider("github");
              return;
            }
          }
        } catch {
          // If browser policy prevents reading preflight response, proceed with standard navigation
        }

        window.location.href = data.url;
      } else {
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to initiate GitHub sign-in.");
      setOauthFallbackProvider("github");
    }
  }

  function handleDemoAccess() {
    localStorage.setItem("trace_guest_session", "true");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("trace-warp"));
    }
    setTimeout(() => {
      navigate({ to: "/dashboard" });
    }, 200);
  }

  function handleDemoOAuthLogin(provider: "google" | "github") {
    localStorage.setItem("trace_guest_session", "true");
    localStorage.setItem("trace_demo_provider", provider);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("trace-warp"));
    }
    setTimeout(() => {
      navigate({ to: "/dashboard" });
    }, 200);
  }

  return (
    <div className={styles.authRoot}>
      <AuthBackground />

      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoDot} />
          Trace
        </Link>
        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </header>

      <div className={styles.liveTicker} aria-hidden="true">
        <div className={styles.tItem}>
          <span className={styles.sym}>VASP REGISTRY</span> 4,812 TAGGED{" "}
          <span className={styles.up}>+14 TODAY</span>
        </div>
        <div className={styles.tItem}>
          <span className={styles.sym}>SANCTIONS</span> OFAC / UN{" "}
          <span className={styles.up}>SYNCED</span>
        </div>
        <div className={styles.tItem}>
          <span className={styles.sym}>CROSS-CHAIN</span> 14 BRIDGES{" "}
          <span className={styles.up}>LIVE</span>
        </div>
        <div className={styles.tItem}>
          <span className={styles.sym}>TRACE ACCURACY</span>{" "}
          <span className={styles.up}>99.2% AVG</span>
        </div>
      </div>

      <main className={styles.mainContainer}>
        <div className={styles.authCard}>
          <h1>{isSignup ? "Create account" : "Log in"}</h1>
          <p className={styles.sub}>
            {isSignup
              ? "Start tracing crypto wallets to their nearest exchange."
              : "Sign in to pick up where you left off."}
          </p>

          {existingSessionEmail && (
            <div className={`${styles.alertBox} ${styles.alertSuccess}`} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: "#2fe3a3" }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} />
                  <span>Currently signed in as <strong>{existingSessionEmail}</strong></span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/dashboard" })}
                    style={{
                      flex: 1,
                      background: "#f7931a",
                      color: "#000",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Go to Dashboard →
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setExistingSessionEmail(null);
                    }}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      color: "#fff",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Switch Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {successMsg && (
            <div className={`${styles.alertBox} ${styles.alertSuccess}`}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <ShieldCheck style={{ width: 16, height: 16 }} />
                <span>Verification link sent</span>
              </div>
              <div>{successMsg}</div>
            </div>
          )}

          {error && (
            <div className={`${styles.alertBox} ${styles.alertError}`}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <AlertTriangle style={{ width: 16, height: 16 }} />
                <span>Authentication Notice</span>
              </div>
              <div>{error}</div>
              {oauthFallbackProvider && (
                <button
                  type="button"
                  onClick={() => handleDemoOAuthLogin(oauthFallbackProvider)}
                  className={styles.oauthFallbackBtn}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Continue as {oauthFallbackProvider === "google" ? "Google" : "GitHub"} Demo Analyst →
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} id={isSignup ? "signup-form" : "login-form"} noValidate>
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <label htmlFor="password">Password</label>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              />
              {isSignup && (
                <div className={styles.strengthRow} aria-label="Password strength meter">
                  {[0, 1, 2, 3].map((idx) => {
                    const active = idx < pwStrength;
                    const color =
                      active && pwStrength > 0
                        ? STRENGTH_COLORS[pwStrength - 1]
                        : "rgba(255, 255, 255, 0.09)";
                    return <span key={idx} className={styles.seg} style={{ background: color }} />;
                  })}
                </div>
              )}
            </div>

            {isSignup && (
              <div className={styles.field}>
                <label htmlFor="confirm">Confirm password</label>
                <input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
            )}

            <button
              type="submit"
              id="submit-btn"
              disabled={loading}
              className={`${styles.submitBtn} ${loading ? styles.loading : ""}`}
            >
              {loading
                ? isSignup
                  ? "Creating account…"
                  : "Logging in…"
                : isSignup
                  ? "Create account"
                  : "Log in"}
            </button>
          </form>

          <div className={styles.divider}>or continue with</div>

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogle}
            className={styles.oauthBtn}
          >
            <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleGithub}
            className={styles.oauthBtn}
            style={{ marginTop: '8px' }}
          >
            <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <button type="button" onClick={handleDemoAccess} className={styles.demoBtn}>
            <Sparkles style={{ width: 14, height: 14 }} />
            Demo Analyst Access (Instant Preview)
          </button>

          <div className={styles.switchLine}>
            {isSignup ? (
              <>
                Already tracking? <Link to="/login">Log in</Link>
              </>
            ) : (
              <>
                New here? <Link to="/signup">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
