import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/commercial")({
  head: () => ({
    meta: [
      { title: "Trace for Commercial — Wallet-to-VASP Attribution" },
    ],
  }),
  component: () => <Navigate to="/" hash="enter" />,
});
