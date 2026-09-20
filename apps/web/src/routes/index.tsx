import { createFileRoute } from "@tanstack/react-router";
<<<<<<< HEAD
import { NewLandingPage } from "@/features/gateway/GatewayPage";
=======

import { RootLanding } from "@/components/landing/RootLanding";
>>>>>>> 6fbe4ce170cf154eb6b2200e98a041e0617cdcca

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
<<<<<<< HEAD
  component: NewLandingPage,
=======
  component: RootLanding,
>>>>>>> 6fbe4ce170cf154eb6b2200e98a041e0617cdcca
});
