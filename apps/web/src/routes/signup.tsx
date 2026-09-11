import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — Trace" },
      {
        name: "description",
        content: "Start tracing crypto wallets to their nearest exchange, free.",
      },
      { property: "og:title", content: "Create your account — Trace" },
      { property: "og:description", content: "Wallet attribution without enterprise pricing." },
    ],
  }),
  component: () => <AuthForm mode="signup" />,
});
