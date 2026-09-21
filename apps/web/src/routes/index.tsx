import { createFileRoute } from "@tanstack/react-router";
import { NewLandingPage } from "@/features/gateway/GatewayPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trace — Wallet-to-VASP Attribution" },
      {
        name: "description",
        content:
          "Trace helps investigators and compliance teams connect blockchain wallet activity with actionable attribution intelligence.",
      },
    ],
  }),
  component: NewLandingPage,
});
