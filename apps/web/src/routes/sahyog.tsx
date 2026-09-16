import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { API_BASE } from "@/lib/api";

export const Route = createFileRoute("/sahyog")({
  component: SahyogQueuePage,
});

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
          <div className="flex gap-4">
            <Link to="/dashboard" className="text-sm font-medium hover:text-white text-white/50 transition-colors">
              Back to Dashboard
            </Link>
            <button onClick={fetchQueue} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
