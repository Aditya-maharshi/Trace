import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { GovernmentDashboardPage } from "@/features/government/dashboard/GovernmentDashboardPage";

export const Route = createFileRoute("/government/dashboard")({
  head: () => ({
    meta: [
      { title: "Trace — Government Portal" },
    ],
  }),
  component: GovernmentDashboardAuthGuard,
});

function GovernmentDashboardAuthGuard() {
  const navigate = useNavigate();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuthAndPerms() {
      // 1. Auth check
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/commercial/login" as any, search: { redirect: "/government" } as any });
        return;
      }

      // 2. Permission check — trust ONLY app_metadata (server-controlled).
      // user_metadata is client-writable; do not fall back to it.
      const hasGovAccess = session.user.app_metadata?.["government_access"] === true;

      if (!hasGovAccess) {
        setError("Access Denied: Government access required.");
        setLoadingAuth(false);
        return;
      }

      // Authorized
      setLoadingAuth(false);
    }
    
    checkAuthAndPerms();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#06060a] text-white flex items-center justify-center p-6">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-6 rounded-xl text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>{error}</p>
          <button 
            onClick={() => navigate({ to: "/" as any })}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors text-sm"
          >
            Return to Gateway
          </button>
        </div>
      </div>
    );
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
          <p className="text-white/40 text-sm">Authenticating Government Portal…</p>
        </div>
      </div>
    );
  }

  return <GovernmentDashboardPage />;
}
