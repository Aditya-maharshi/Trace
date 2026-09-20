import { AuthForm } from "@/features/auth/AuthForm";
import type { TrackAuthConfig } from "@/features/auth/types";

export function CommercialAuthPage({ mode }: { mode: "signup" | "login" }) {
  const config: TrackAuthConfig = {
    track: "commercial",
    loginPath: "/commercial/login",
    signupPath: "/commercial/signup",
    dashboardPath: "/commercial/dashboard",
    allowDemoAccess: true,
    altPrompt:
      mode === "login"
        ? { text: "New here?", label: "Sign up", to: "/commercial/signup" }
        : { text: "Already tracking?", label: "Log in", to: "/commercial/login" },
    copy: {},
  };
  return <AuthForm mode={mode} config={config} />;
}
