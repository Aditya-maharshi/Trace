import { useEffect, useRef, useState } from "react";
import { type PathResult, truncateAddress } from "@/lib/types";
import { motion, AnimatePresence } from "motion/react";

function NodeIcon({ isFirst, isLast }: { isFirst: boolean; isLast: boolean }) {
  if (isFirst) return <span className="text-[9px] font-black text-blue-300">⬡</span>;
  if (isLast) return <span className="text-[9px] font-black text-emerald-300">★</span>;
  return <span className="text-[9px] text-white/50">◎</span>;
}

export function GraphViz({
  paths,
  target,
  vasp,
  highlightedHop,
}: {
  paths: PathResult[];
  target: string;
  vasp: string;
  highlightedHop?: { pathIndex: number; hopIndex: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const hops = paths[0]?.hops ?? [];
  const H = 280;
  const padX = 80;
  const usableW = Math.max(0, width - padX * 2);
  const centerY = H / 2;
  const waveAmp = 55;

  const positions = hops.map((hop, i) => {
    const t = hops.length > 1 ? i / (hops.length - 1) : 0.5;
    const x = padX + t * usableW;
    // Sine wave with diminishing amplitude toward ends
    const y = centerY + Math.sin(t * Math.PI) * Math.sin(i * 1.2 + 0.5) * waveAmp;
    return { x, y, hop, isFirst: i === 0, isLast: i === hops.length - 1 };
  });

  if (hops.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-white/20 text-sm">
        No path data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: H }}>
      {/* SVG edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ height: H }}>
        <defs>
          <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {width > 0 && positions.map((pos, i) => {
          if (i === positions.length - 1) return null;
          const next = positions[i + 1]!;
          const cpx = pos.x + (next.x - pos.x) * 0.5;
          const isActive = highlightedHop?.hopIndex === i || hoveredIdx === i || hoveredIdx === i + 1;

          return (
            <motion.path
              key={`edge-${i}`}
              d={`M ${pos.x} ${pos.y} C ${cpx} ${pos.y}, ${cpx} ${next.y}, ${next.x} ${next.y}`}
              fill="none"
              stroke={isActive ? "url(#flow-grad)" : "rgba(255,255,255,0.1)"}
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeDasharray={isActive ? "none" : "5 5"}
              filter={isActive ? "url(#glow)" : "none"}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: i * 0.18, ease: "easeInOut" }}
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {width > 0 && positions.map((pos, i) => {
        const isHighlighted = highlightedHop?.hopIndex === i;
        const isHovered = hoveredIdx === i;
        const active = isHighlighted || isHovered;

        const nodeColor = pos.isFirst
          ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
          : pos.isLast
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-white/70";

        return (
          <motion.div
            key={`node-${i}`}
            className="absolute cursor-pointer z-10"
            style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.18, type: "spring", stiffness: 200 }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Glow ring for highlighted */}
            {(active) && (
              <div className={`absolute inset-0 rounded-xl scale-150 blur-lg opacity-50 ${
                pos.isLast ? "bg-emerald-400" : "bg-blue-400"
              }`} />
            )}

            <motion.div
              animate={{ scale: active ? 1.08 : 1 }}
              transition={{ duration: 0.2 }}
              className={`relative flex flex-col items-center p-3 rounded-xl border backdrop-blur-xl shadow-xl transition-colors duration-200 ${nodeColor} ${
                isHighlighted ? "ring-2 ring-white/40" : ""
              }`}
              style={{ minWidth: 90 }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <NodeIcon isFirst={pos.isFirst} isLast={pos.isLast} />
                <span className="font-mono text-[11px] leading-none">
                  {pos.hop.ensName ?? truncateAddress(pos.hop.address)}
                </span>
              </div>
              {pos.hop.label && (
                <span className={`text-[9px] uppercase tracking-widest font-bold opacity-60`}>
                  {pos.hop.label}
                </span>
              )}
            </motion.div>

            {/* Tooltip */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-50 bg-[#111118] border border-white/15 rounded-xl p-3 shadow-2xl min-w-[190px]"
                >
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Node details</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-white/40">Address</span>
                      <span className="font-mono text-white/80">{truncateAddress(pos.hop.address)}</span>
                    </div>
                    {pos.hop.label && (
                      <div className="flex justify-between gap-4 text-xs">
                        <span className="text-white/40">Label</span>
                        <span className="text-white/80">{pos.hop.label}</span>
                      </div>
                    )}
                    {pos.hop.ensName && (
                      <div className="flex justify-between gap-4 text-xs">
                        <span className="text-white/40">ENS</span>
                        <span className="text-white/80">{pos.hop.ensName}</span>
                      </div>
                    )}
                    <div className="pt-1.5 mt-1.5 border-t border-white/10 flex justify-between gap-4 text-xs">
                      <span className="text-white/40">Hop index</span>
                      <span className="text-white/80">{i}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
