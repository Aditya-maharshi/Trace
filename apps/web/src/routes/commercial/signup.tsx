import { createFileRoute } from "@tanstack/react-router";
import { CommercialAuthPage } from "@/features/commercial/auth/CommercialAuthPage";

export const Route = createFileRoute("/commercial/signup")({
  head: () => ({
    meta: [{ title: "Sign up for Trace" }],
  }),
  component: () => <CommercialAuthPage mode="signup" />,
});
