import React from 'react';
import { ReactFlow, Controls, Background, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function GraphView({ data }: { data?: any }) {
  // Mock data setup if no real API responses yet
  const initialNodes: Node[] = [
    { id: '1', position: { x: 100, y: 200 }, data: { label: 'Suspect Wallet\n0x7a2...41d' }, type: 'input' },
    { id: '2', position: { x: 400, y: 100 }, data: { label: 'Mixer Node\n0x332...' } },
    { id: '3', position: { x: 400, y: 300 }, data: { label: 'Intermediate\n0x442...' } },
    { id: '4', position: { x: 700, y: 200 }, data: { label: 'Binance (VASP)\n0xBinance...' }, type: 'output' },
  ];

  const initialEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2', label: '10 ETH', style: { strokeWidth: 3, stroke: '#d8b4fe' } },
    { id: 'e1-3', source: '1', target: '3', label: '5 ETH', style: { strokeWidth: 2, stroke: '#d8b4fe' } },
    { id: 'e2-4', source: '2', target: '4', label: '9.9 ETH', style: { strokeWidth: 3, stroke: '#d8b4fe' } },
    { id: 'e3-4', source: '3', target: '4', label: '4.9 ETH', style: { strokeWidth: 2, stroke: '#d8b4fe' } },
  ];

  return (
    <div style={{ height: '600px', width: '100%', background: '#111', border: '1px solid #333', borderRadius: 12, marginTop: 24 }}>
      <ReactFlow 
        nodes={initialNodes} 
        edges={initialEdges} 
        fitView
      >
        <Background color="#444" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
