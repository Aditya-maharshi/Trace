import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/features/auth/AuthForm";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; switch?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    switch: typeof search.switch === "string" ? search.switch : undefined,
  }),
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
