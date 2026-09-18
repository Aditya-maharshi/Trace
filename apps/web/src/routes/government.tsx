import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { API_BASE } from "@/lib/api";

export const Route = createFileRoute("/government")({
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
        navigate({ to: "/login", search: { redirect: "/government" } as any });
        return;
      }

      // 2. Permission check
      const hasGovAccess = session.user.app_metadata?.government_access === true || 
                           session.user.user_metadata?.government_access === true;
                           
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
            onClick={() => navigate({ to: "/" })}
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

  return <SahyogQueuePage />;
}

function SahyogQueuePage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/sahyog/queue`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  return (
    <div className="min-h-screen bg-[#06060a] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-indigo-400" />
              SAHYOG Dispatch Queue
            </h1>
            <p className="text-white/50 text-sm mt-1">Prepared payloads awaiting portal credentials.</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={fetchQueue} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-px h-6 bg-white/10 mx-2"></div>
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] border-b border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium text-white/70">Date</th>
                <th className="px-4 py-3 font-medium text-white/70">Case ID</th>
                <th className="px-4 py-3 font-medium text-white/70">VASP</th>
                <th className="px-4 py-3 font-medium text-white/70">Target Wallet</th>
                <th className="px-4 py-3 font-medium text-white/70">Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                    No payloads in the queue.
                  </td>
                </tr>
              )}
              {queue.map((entry) => (
                <tr key={entry.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-white/80">{entry.case_id.split("-")[0]}...</td>
                  <td className="px-4 py-3 font-medium">{entry.metadata?.attributedVasp}</td>
                  <td className="px-4 py-3 font-mono text-white/60 text-xs">{entry.metadata?.targetAddress}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 text-[10px] uppercase font-semibold tracking-wider">
                      Prepared (Not Transmitted)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
