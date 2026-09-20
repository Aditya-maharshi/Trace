import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { BfsProgressMessage } from "@/hooks/use-attribution-stream";

interface BfsProgressFeedProps {
  messages: BfsProgressMessage[];
}

function getIcon(type: BfsProgressMessage["type"]): { icon: string; color: string } {
  switch (type) {
    case "exploring":  return { icon: "⬡", color: "text-blue-400" };
    case "fetched":    return { icon: "↓", color: "text-cyan-400" };
    case "vasp_found": return { icon: "✓", color: "text-emerald-400" };
    case "pruned":     return { icon: "✗", color: "text-amber-500/80" };
    case "done":       return { icon: "★", color: "text-purple-400" };
    default:           return { icon: "·", color: "text-white/40" };
  }
}

export function BfsProgressFeed({ messages }: BfsProgressFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-white/90 tracking-wide">Live Graph Traversal</span>
        </div>
        {messages.length > 0 && (
          <span className="text-xs text-white/30 tabular-nums">
            {messages.length} event{messages.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Terminal */}
      <div className="h-72 overflow-y-auto rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs backdrop-blur-xl scrollbar-none">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const { icon, color } = getIcon(msg.type);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2.5 py-0.5 leading-relaxed"
              >
                <span className={`shrink-0 w-4 text-center ${color} font-bold`}>{icon}</span>
                <span className={`break-all ${color}`}>{msg.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Blinking cursor */}
        <div className="mt-1.5 flex gap-2.5 text-white/20">
          <span className="w-4 text-center">›</span>
          <span className="animate-pulse text-white/40">_</span>
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
