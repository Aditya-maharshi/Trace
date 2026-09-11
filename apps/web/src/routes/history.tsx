import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Lookup history — Trace" },
      {
        name: "description",
        content:
          "Review past wallet attribution lookups with timestamps, confidence, and risk flags.",
      },
      { property: "og:title", content: "Lookup history — Trace" },
      { property: "og:description", content: "Full audit trail of every wallet you've traced." },
    ],
  }),
  component: History,
});

interface LookupRow {
  id: string;
  queried_address: string;
  requested_at: string;
  nearest_vasp: string | null;
  confidence: string | null;
  risk: string | null;
}

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-foreground/40">—</span>;
  const colors: Record<string, string> = {
    High: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[level] ?? colors["Low"]}`}
    >
      {level}
    </span>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-foreground/40">—</span>;
  const isHigh = level === "HIGH";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        isHigh
          ? "bg-red-500/15 text-red-400 border-red-500/30"
          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      }`}
    >
      {level}
    </span>
  );
}

function History() {
  const navigate = useNavigate();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [lookups, setLookups] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth guard — redirect to login if not signed in
  useEffect(() => {
    if (localStorage.getItem("trace_guest_session")) {
      setCheckedAuth(true);
      return;
    }

    supabase.auth.getSession().then((res) => {
      if (res.data.session) {
        setCheckedAuth(true);
      } else {
        navigate({ to: "/login" });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCheckedAuth(true);
      } else if (!localStorage.getItem("trace_guest_session")) {
        navigate({ to: "/login" });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Fetch lookups once auth is confirmed
  useEffect(() => {
    if (!checkedAuth) return;

    async function fetchLookups() {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from("lookups")
          .select("id, queried_address, requested_at, nearest_vasp, confidence, risk")
          .order("requested_at", { ascending: false })
          .limit(100);

        if (err) {
          if (err.code === "PGRST205" || err.message.includes("does not exist")) {
            // Table doesn't exist yet in Supabase schema; gracefully show empty state
            setLookups([]);
          } else {
            setError(err.message);
          }
        } else {
          setLookups((data as LookupRow[]) ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load history");
      }
      setLoading(false);
    }

    fetchLookups();
  }, [checkedAuth]);

  if (!checkedAuth) return <div className="min-h-screen bg-background" />;

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <Link to="/" className="font-serif text-lg">
          Trace
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="text-sm text-foreground/60 transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <button
            onClick={async () => {
              localStorage.removeItem("trace_guest_session");
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
            className="text-sm text-foreground/60 transition-colors hover:text-foreground cursor-pointer"
          >
            Sign out
          </button>
        </nav>
      </header>

      <div className="px-6 pt-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">Lookup History</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Audit trail of every wallet attribution you've run.
          </p>
        </motion.div>

        <div className="mt-8">
          {loading && <p className="text-center text-sm text-foreground/50">Loading history…</p>}

          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          {!loading && !error && lookups.length === 0 && (
            <div className="text-center py-16">
              <p className="text-foreground/50">No lookups yet.</p>
              <Link
                to="/dashboard"
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                Trace a wallet from the dashboard →
              </Link>
            </div>
          )}

          {!loading && lookups.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="overflow-x-auto rounded-lg border border-border"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Address</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">
                      Nearest VASP
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">
                      Confidence
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-foreground/70">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {lookups.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.queried_address.slice(0, 6)}…{row.queried_address.slice(-4)}
                      </td>
                      <td className="px-4 py-3 text-foreground/70">
                        {format(new Date(row.requested_at), "MMM d, yyyy  HH:mm")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground/70">
                        {row.nearest_vasp
                          ? `${row.nearest_vasp.slice(0, 6)}…${row.nearest_vasp.slice(-4)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge level={row.confidence} />
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={row.risk} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
