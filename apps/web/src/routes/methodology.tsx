import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Database, GitFork, AlertTriangle, Layers, Scale, ExternalLink, Sparkles } from "lucide-react";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Trace — AML & VASP Attribution Methodology" },
      {
        name: "description",
        content:
          "Algorithmic attribution framework, multi-hop BFS graph heuristics, verified VASP registry, and sanctions screening methodology.",
      },
    ],
  }),
  component: MethodologyPage,
});

const DEFAULT_METHODOLOGY = {
  notice: "Investigative lead only — not a formal compliance or legal determination.",
  vaspRegistryNotice: "The VASP registry is a calibrated dataset of publicly-known exchange deposit, hot wallet, and cold custody clusters (Binance, Coinbase, Kraken, OKX, Bybit, Huobi, KuCoin, Bitfinex, Bitstamp). Unlisted VASPs, private OTC desks, and novel services are identified as unhosted entities.",
  sanctionsSource: "Sanctions screening is powered by OpenSanctions real-time feeds cross-referenced with OFAC Specially Designated Nationals (SDN) cryptocurrency identifiers and known exploit drainer contracts.",
  humanReviewDisclaimer: "Attribution scores and nearest VASP confidence rankings are automated pattern-matching heuristics intended as forensic investigative leads. Rigorous compliance analyst review is required before filing Suspicious Activity Reports (SARs) or initiating freezing actions.",
  calibrationDate: "2026-09",
  calibrationSample: "50 known VASP-linked wallets + 50 random unhosted wallets",
  calibratedHighThreshold: 12.01,
  calibratedLowThreshold: 0,
  activeHighThreshold: 8,
  activeLowThreshold: 3,
  limitationsDocument: "See LIMITATIONS.md for comprehensive methodology, token allowlist, and structuring detection boundaries.",
};

function MethodologyPage() {
  const [methodology, setMethodology] = useState<any>(DEFAULT_METHODOLOGY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const env = (import.meta.env || {}) as Record<string, string | undefined>;
    const API_BASE = env['VITE_API_URL'] || (typeof window !== 'undefined' && window.location.port === '8083' ? 'http://localhost:3000' : '');
    const API_KEY = env['VITE_API_KEY'] || "";

    const url = (API_BASE ? API_BASE : '') + '/api/v1/methodology';
    fetch(url, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {}
    })
      .then((res) => {
        if (!res.ok) throw new Error("Methodology fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data && data.notice) {
          setMethodology(data);
        }
      })
      .catch((err) => {
        console.warn("Using baseline methodology:", err);
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#06060a] text-[#f2f2f7] selection:bg-[#f7931a] selection:text-black">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#06060a]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              v1.2 Active Specification
            </span>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 bg-emerald-600 from-[#f7931a] to-[#ffaa40] text-[#08080c] text-xs font-bold px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(247,147,26,0.35)] hover:shadow-[0_0_22px_rgba(247,147,26,0.6)] hover:from-[#ffaa40] hover:to-[#f7931a] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-14 space-y-10">
        {/* Title Header */}
        <div className="space-y-3 border-b border-white/10 pb-8">
          <div className="inline-flex items-center gap-2 font-mono text-xs text-[#f7931a] tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-[#f7931a] animate-pulse"></span>
            Forensic Specification & Disclosure
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white font-serif">
            Trace Methodology
          </h1>
          <p className="text-base md:text-lg text-white/60 leading-relaxed max-w-3xl">
            Automated Attribution of Unknown Cryptocurrency Wallets to Nearest Virtual Asset Service Providers (VASPs) through Multi-Hop Graph Traversal and Blockchain Intelligence APIs.
          </p>
        </div>

        {/* Section Cards */}
        <div className="grid gap-6">
          {/* Important Notice */}
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-7 space-y-3 relative overflow-hidden">
            <div className="flex items-center gap-3 text-amber-400 font-semibold text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <h2>Compliance Scope & Legal Status</h2>
            </div>
            <p className="text-white/80 leading-relaxed text-sm md:text-base">
              {methodology.notice}
            </p>
            <p className="text-white/60 text-xs leading-relaxed">
              {methodology.humanReviewDisclaimer}
            </p>
          </section>

          {/* VASP Registry */}
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-7 space-y-3">
            <div className="flex items-center gap-3 text-[#8c9dfc] font-semibold text-lg">
              <Database className="w-5 h-5 text-[#8c9dfc] shrink-0" />
              <h2>VASP Clustering & Exchange Registry</h2>
            </div>
            <p className="text-white/70 leading-relaxed text-sm md:text-base">
              {methodology.vaspRegistryNotice}
            </p>
            <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono text-white/50">
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Binance</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Coinbase</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Kraken</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">OKX</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Bybit</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Huobi</span>
              <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10">Bitfinex</span>
            </div>
          </section>

          {/* Graph Traversal & Attribution Heuristics */}
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-7 space-y-4">
            <div className="flex items-center gap-3 text-emerald-400 font-semibold text-lg">
              <GitFork className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2>Multi-Hop BFS Graph Traversal & Heuristics</h2>
            </div>
            <p className="text-white/70 leading-relaxed text-sm md:text-base">
              Trace executes depth-bounded Breadth-First Search (BFS) starting from the unhosted target wallet across on-chain transfers. Transactions are analyzed using five core heuristics:
            </p>
            <ul className="grid sm:grid-cols-2 gap-3 text-sm text-white/70 font-mono">
              <li className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <strong className="text-white block font-sans mb-1">Hop Decay:</strong>
                Confidence attenuates non-linearly with each intermediary hop (1-hop = 90%+, 2-hop = 65%+, 3-hop = 35%).
              </li>
              <li className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <strong className="text-white block font-sans mb-1">Volume Weighting:</strong>
                Larger fund flow fractions contribute exponentially higher attribution mass.
              </li>
              <li className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <strong className="text-white block font-sans mb-1">Structuring Detection:</strong>
                Identifies rapid fan-out / fan-in split transactions under regulatory reporting thresholds ($10k CTR).
              </li>
              <li className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <strong className="text-white block font-sans mb-1">Bridge Exit Mapping:</strong>
                Detects LayerZero, Wormhole, Arbitrum, Optimism, and Polygon bridge ingress/egress points.
              </li>
            </ul>
          </section>

          {/* Sanctions Screening */}
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-7 space-y-3">
            <div className="flex items-center gap-3 text-rose-400 font-semibold text-lg">
              <ShieldCheck className="w-5 h-5 text-rose-400 shrink-0" />
              <h2>Sanctions & OFAC Screening</h2>
            </div>
            <p className="text-white/70 leading-relaxed text-sm md:text-base">
              {methodology.sanctionsSource}
            </p>
          </section>

          {/* Calibration & Thresholds */}
          <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-7 space-y-4">
            <div className="flex items-center gap-3 text-cyan-400 font-semibold text-lg">
              <Scale className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2>Empirical Calibration & Thresholds</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5 space-y-2">
                <div className="text-white/50 text-xs font-mono">CALIBRATION RUN</div>
                <div className="font-semibold text-white">{methodology.calibrationDate}</div>
                <div className="text-white/70 text-xs">{methodology.calibrationSample}</div>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5 space-y-2">
                <div className="text-white/50 text-xs font-mono">CONFIDENCE BOUNDS</div>
                <div className="text-white text-xs font-mono">
                  High Threshold: <span className="text-emerald-400 font-semibold">{methodology.activeHighThreshold} / 10</span>
                </div>
                <div className="text-white text-xs font-mono">
                  Low / Flag Threshold: <span className="text-rose-400 font-semibold">{methodology.activeLowThreshold} / 10</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom CTA Section */}
        <div className="bg-emerald-600 from-white/[0.04] to-transparent border border-white/10 rounded-xl p-8 text-center space-y-4 relative overflow-hidden">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#f7931a]/10 border border-[#f7931a]/30 text-[#f7931a]">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold text-white font-serif">Run Live Wallet Attribution</h3>
          <p className="text-sm text-white/60 max-w-md mx-auto">
            Experience our multi-hop graph engine resolving unhosted addresses to nearest exchange endpoints in real-time.
          </p>
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 bg-emerald-600 from-[#f7931a] to-[#ffaa40] text-[#08080c] text-sm font-bold px-6 py-2.5 rounded-lg shadow-[0_0_20px_rgba(247,147,26,0.4)] hover:shadow-[0_0_28px_rgba(247,147,26,0.65)] hover:from-[#ffaa40] hover:to-[#f7931a] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch Forensic Engine</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50 font-mono">
          <div>Trace Blockchain Intelligence — SIH Edition</div>
          <Link to="/" className="text-white/70 hover:text-white underline">
            Return to Landing Page
          </Link>
        </div>
      </div>
    </main>
  );
}
