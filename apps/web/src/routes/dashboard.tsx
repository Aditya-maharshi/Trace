import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getConfig } from "@/lib/api";
import { CommercialConsole } from "@/components/console/CommercialConsole";

const CONSOLE_TABS = ["overview", "screen", "batch", "alerts", "history", "api", "team"] as const;
type ConsoleTab = (typeof CONSOLE_TABS)[number];

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { tab?: ConsoleTab } => {
    const tab = search.tab;
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
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then((c) => setIsDemoMode(c.isDemoMode)).catch(console.error);
    if (localStorage.getItem("trace_guest_session")) {
      const demoProvider = localStorage.getItem("trace_demo_provider");
      setUserEmail(demoProvider ? `${demoProvider} demo analyst` : "guest analyst");
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) setUserEmail(user.email);
      });
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("trace_guest_session")) {
      setCheckedAuth(true);
      return;
    }

    supabase.auth.getSession().then((res) => {
      if (res.data.session) {
        setCheckedAuth(true);
      } else {
        const hasAuthParams =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token") ||
            window.location.search.includes("code="));
        if (!hasAuthParams) navigate({ to: "/login", search: { redirect: "/dashboard" } as never });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCheckedAuth(true);
      } else if (!localStorage.getItem("trace_guest_session")) {
        navigate({ to: "/login", search: { redirect: "/dashboard" } as never });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!checkedAuth) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin" />
          <p className="text-white/40 text-sm">Authenticating…</p>
        </div>
      </div>
    );
  }

  return <CommercialConsole userEmail={userEmail} isDemoMode={isDemoMode} initialPage={tab} />;
}
