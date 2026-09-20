import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Screening history — Trace" },
      {
        name: "description",
        content: "Full log of every screening stored for this account.",
      },
    ],
  }),
  component: () => <Navigate to="/dashboard" search={{ tab: "history" }} />,
});
