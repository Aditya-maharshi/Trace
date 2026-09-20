import { createFileRoute } from "@tanstack/react-router";
import { CommercialAuthPage } from "@/features/commercial/auth/CommercialAuthPage";

export const Route = createFileRoute("/commercial/login")({
  head: () => ({
    meta: [{ title: "Log in to Trace" }],
  }),
  component: () => <CommercialAuthPage mode="login" />,
});
