import { useMemo, useEffect, useState } from "react";
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, MarkerType, Node, Edge, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type PathResult, truncateAddress } from "@/lib/types";

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  isTarget?: boolean;
  isVasp?: boolean;
}

export function AttributionGraph({
  graph,
  target,
}: {
  graph?: {
    nodes: Array<{ id: string; type: "wallet" | "vasp" | "mixer" | "bridge" | "sanctioned"; label?: string }>;
    edges: Array<{ source: string; target: string; hopIndex: number; valueUSD: number; asset: string; timestamp: string }>;
    truncated: boolean;
  } | undefined;
  target: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;

    const newNodes: Node<CustomNodeData>[] = [];
    const newEdges: Edge[] = [];
    
    let xStep = 250;
    let yStep = 80;

    // Build hop depth map for positioning
    const depthMap = new Map<string, number>();
    depthMap.set(target.toLowerCase(), 0);
    
    // Simple topological sort / depth assignment
    graph.edges.forEach(e => {
      const srcDepth = depthMap.get(e.source) ?? 0;
      depthMap.set(e.target, Math.max(depthMap.get(e.target) ?? 0, srcDepth + 1));
    });

    const yOffsets: Record<number, number> = {};

    graph.nodes.forEach((n) => {
      const isTarget = n.id === target.toLowerCase();
      const depth = depthMap.get(n.id) ?? 0;
      
      yOffsets[depth] = (yOffsets[depth] || 0) + 1;
      const yOff = (yOffsets[depth] - 1) * yStep - (yOffsets[depth] * yStep) / 2;

      let bg = "rgba(255, 255, 255, 0.05)";
      let border = "1px solid rgba(255, 255, 255, 0.1)";
      let color = "rgba(255, 255, 255, 0.7)";

      if (isTarget) {
        bg = "rgba(59, 130, 246, 0.1)"; border = "1px solid rgba(59, 130, 246, 0.5)"; color = "#93c5fd";
      } else if (n.type === "sanctioned") {
        bg = "rgba(239, 68, 68, 0.1)"; border = "1px solid rgba(239, 68, 68, 0.5)"; color = "#fca5a5";
      } else if (n.type === "vasp") {
        bg = "rgba(16, 185, 129, 0.1)"; border = "1px solid rgba(16, 185, 129, 0.5)"; color = "#6ee7b7";
      } else if (n.type === "bridge" || n.type === "mixer") {
        bg = "rgba(168, 85, 247, 0.1)"; border = "1px solid rgba(168, 85, 247, 0.5)"; color = "#d8b4fe";
      }

      newNodes.push({
        id: n.id,
        position: { x: depth * xStep, y: yOff },
        data: {
          label: n.label || truncateAddress(n.id),
          sublabel: n.type.toUpperCase(),
          isTarget,
        },
        type: "default",
        style: {
          background: bg, border, color,
          borderRadius: "12px", padding: "10px", fontSize: "12px", fontFamily: "monospace",
        }
      });
    });

    graph.edges.forEach((e) => {
      newEdges.push({
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.2)' },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graph, target, setNodes, setEdges]);

  return (
    <div className="w-full h-[350px] rounded-xl overflow-hidden border border-white/10 bg-black/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="rgba(255,255,255,0.1)" />
        <Controls className="!bg-white/5 !border-white/10 !fill-white/50" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
