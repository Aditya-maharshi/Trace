import { createFileRoute } from "@tanstack/react-router";
import { CommercialDashboardPage } from "@/features/commercial/dashboard/CommercialDashboardPage";

const CONSOLE_TABS = ["overview", "screen", "batch", "alerts", "history", "api", "team"] as const;
type ConsoleTab = (typeof CONSOLE_TABS)[number];

export const Route = createFileRoute("/commercial/dashboard")({
  validateSearch: (search: Record<string, unknown>): { tab?: ConsoleTab } => {
    const tab = search['tab'];
    if (typeof tab === "string" && (CONSOLE_TABS as readonly string[]).includes(tab)) {
      return { tab: tab as ConsoleTab };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Trace — Compliance Console" },
      {
        name: "description",
        content: "Wallet screening, risk alerts, and API access for VASPs and compliance teams.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { tab } = Route.useSearch();
  return <CommercialDashboardPage initialPage={tab} />;
}
