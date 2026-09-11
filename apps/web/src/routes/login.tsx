import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Trace wallet attribution" },
      { name: "description", content: "Sign in to Trace wallets and find their nearest exchange." },
      { property: "og:title", content: "Log in — Trace" },
      { property: "og:description", content: "Sign in to your Trace attribution workspace." },
    ],
  }),
  component: () => <AuthForm mode="login" />,
});
