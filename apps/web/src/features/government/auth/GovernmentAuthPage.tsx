import { AuthForm } from "@/features/auth/AuthForm";
import type { TrackAuthConfig } from "@/features/auth/types";

export function GovernmentAuthPage() {
  const config: TrackAuthConfig = {
    track: "government",
    loginPath: "/government/login",
    dashboardPath: "/government/dashboard",
    allowDemoAccess: false,
    altPrompt: {
      text: "Need access?",
      label: "Request a briefing",
      to: "/government",
      hash: "brief",
    },
    copy: {
      subtitle: "Sign in to the Trace agency portal.",
      note: "Access is provisioned per unit — there is no public sign-up.",
    },
  };
  return <AuthForm mode="login" config={config} />;
}
