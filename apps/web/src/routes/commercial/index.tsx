import { createFileRoute } from "@tanstack/react-router";
import { CommercialLandingPage } from "@/features/commercial/landing/CommercialLandingPage";

export const Route = createFileRoute("/commercial/")({
  head: () => ({
    meta: [
      { title: "Trace — Commercial Track" },
      {
        name: "description",
        content: "Trace for compliance teams and VASPs.",
      },
    ],
  }),
  component: CommercialLandingPage,
});
