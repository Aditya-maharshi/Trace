import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { SearchBar } from "@/components/dashboard/SearchBar";
import { ResultCard } from "@/components/dashboard/ResultCard";
import { supabase } from "@/integrations/supabase/client";
import { useAttributionStream } from "@/hooks/use-attribution-stream";
import { BfsProgressFeed } from "@/components/dashboard/BfsProgressFeed";
import { History, LogOut, Activity, AlertTriangle } from "lucide-react";
import { getConfig } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Trace — Trace a wallet" },
      {
        name: "description",
        content: "Paste a wallet address and watch the transaction graph resolve to an exchange.",
      },
      { property: "og:title", content: "Trace — Wallet Attribution" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const { data, narrative, loading, error, progressLog, lookup } = useAttributionStream();

  useEffect(() => {
    getConfig().then(c => setIsDemoMode(c.isDemoMode)).catch(console.error);
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
        if (!hasAuthParams) navigate({ to: "/login" });
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

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-[#06060a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-[#f7931a]/10 blur-[160px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[70vw] h-[70vw] rounded-full bg-[#8c9dfc]/10 blur-[160px]" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Topbar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="w-2 h-2 rounded-full bg-[#f7931a] shadow-[0_0_12px_2px_rgba(247,147,26,0.8)]"></span>
          <span className="font-serif text-lg font-semibold tracking-tight text-white group-hover:text-orange-300 transition-colors">
            Trace
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            to="/methodology"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            Methodology
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Link>
          <button
            id="signout-btn"
            onClick={async () => {
              localStorage.removeItem("trace_guest_session");
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {isDemoMode && (
        <div className="w-full bg-yellow-500/20 border-b border-yellow-500/30 text-yellow-300 py-1.5 px-4 text-xs font-semibold uppercase tracking-widest text-center flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Demo Mode: Live chain data access disabled. Using static fixture cache.</span>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6">
        {/* Hero section — only visible before first Trace */}
        <AnimatePresence>
          {!data && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.5 }}
              className="pt-24 pb-10 text-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-orange-500/20 bg-orange-500/5 text-orange-400 text-xs font-medium tracking-wide">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                Live blockchain attribution engine
              </div>
              <h1 className="text-5xl md:text-6xl font-serif font-semibold text-white leading-tight mb-4 drop-shadow-2xl">
                Trace every<br />
                <span className="bg-gradient-to-r from-[#f7931a] to-[#2fe3a3] bg-clip-text text-transparent">
                  on-chain move
                </span>
              </h1>
              <p className="text-white/50 text-lg max-w-md mx-auto leading-relaxed">
                Enter an Ethereum address to track its fund flow to a known exchange.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* After Trace — compact heading */}
        {(data || loading) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-8 pb-4 w-full max-w-6xl"
          >
            <p className="text-xs text-white/30 uppercase tracking-widest font-medium">Trace result</p>
          </motion.div>
        )}

        {/* Search */}
        <div className={`w-full max-w-3xl transition-all duration-500 ${data || loading ? "pb-6" : "pb-16"}`}>
          <SearchBar onSearch={(addr) => lookup(addr)} loading={loading} />
        </div>

        {/* BFS Progress */}
        <AnimatePresence mode="wait">
          {loading && !data && (
            <motion.div
              key="bfs-feed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-3xl pb-8"
            >
              <BfsProgressFeed messages={progressLog} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-8 w-full max-w-3xl rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3"
            >
              <span className="text-rose-400 text-lg leading-none mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-semibold text-rose-400">Trace failed</p>
                <p className="text-xs text-rose-400/70 mt-0.5">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {data && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-6xl pb-24"
            >
              <ResultCard data={data} narrative={narrative} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
