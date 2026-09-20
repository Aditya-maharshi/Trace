import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/commercial")({
  head: () => ({
    meta: [
      { title: "Trace for Commercial — Wallet-to-VASP Attribution" },
    ],
  }),
  component: () => <Outlet />,
});
