import { useState } from "react";
import { Loader2, Search, Zap } from "lucide-react";
import { ETH_ADDRESS_RE } from "@/lib/types";
import { motion } from "motion/react";

export function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (address: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (!ETH_ADDRESS_RE.test(address)) {
      setError("Enter a valid Ethereum address (0x… + 40 hex chars)");
      return;
    }
    setError(null);
    onSearch(address);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-3xl mx-auto">
      <motion.div
        animate={{ 
          boxShadow: focused 
            ? "0 0 0 2px rgba(52,211,153,0.4), 0 0 40px rgba(52,211,153,0.15)" 
            : "0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4)" 
        }}
        transition={{ duration: 0.25 }}
        className="relative flex items-center bg-white/5 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10"
      >
        {/* Left icon */}
        <div className="pl-5 pr-3 text-white/30">
          <Search className="h-5 w-5" />
        </div>

        <input
          id="wallet-address-input"
          aria-label="Ethereum wallet address"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={loading}
          placeholder="0x... paste an Ethereum address"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent py-4 pr-2 font-mono text-sm text-white placeholder:text-white/25 outline-none disabled:opacity-50 min-w-0"
        />

        <div className="p-2 shrink-0">
          <button
            id="trace-wallet-btn"
            type="submit"
            disabled={loading || !value.trim()}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-95"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {loading ? "Tracing…" : "Trace"}
          </button>
        </div>
      </motion.div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2.5 ml-5 text-xs text-rose-400 flex items-center gap-1.5"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
          {error}
        </motion.p>
      )}
    </form>
  );
}
