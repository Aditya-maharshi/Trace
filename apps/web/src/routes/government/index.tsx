import { createFileRoute } from "@tanstack/react-router";
import { GovernmentLandingPage } from "@/features/government/landing/GovernmentLandingPage";

export const Route = createFileRoute("/government/")({
  head: () => ({
    meta: [
      { title: "Trace — Government Operations" },
    ],
  }),
  component: GovernmentLandingPage,
});
