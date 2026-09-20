import { ShieldAlert, RefreshCw } from "lucide-react";
import { useSahyogQueue } from "@/hooks/useSahyogQueue";

export function SahyogView() {
  const { queue, loading, error, refetch } = useSahyogQueue();

  return (
    <div style={{ padding: "0 26px 80px", width: "100%" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-indigo-400" />
            SAHYOG Dispatch Queue
          </h1>
          <p className="text-white/50 text-sm mt-1">Prepared payloads awaiting portal credentials.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={refetch} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6">
          {error}
        </div>
      )}

      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
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
                <td className="px-4 py-3 font-mono text-white/80">{entry.case_id?.split("-")[0]}...</td>
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
  );
}
