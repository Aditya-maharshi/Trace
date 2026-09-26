import React, { useState } from 'react';

export type CaseStatus = 'tracing' | 'attributed' | 'prepared' | 'transmitted';

export interface CaseRecord {
  id: string;
  caseReference: string;
  wallet: string;
  status: CaseStatus;
  date: string;
  vasp?: string;
}

const MOCK_CASES: CaseRecord[] = [
  { id: '1', caseReference: 'NCRP-2026-33291', wallet: '0x7a2f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d', status: 'tracing', date: '2026-09-25' },
  { id: '2', caseReference: 'NCRP-2026-33292', wallet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', status: 'attributed', date: '2026-09-24', vasp: 'Binance' },
  { id: '3', caseReference: 'NCRP-2026-33293', wallet: '0x123f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d', status: 'prepared', date: '2026-09-23', vasp: 'Kraken' },
  { id: '4', caseReference: 'NCRP-2026-33294', wallet: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', status: 'transmitted', date: '2026-09-22', vasp: 'Huobi' },
];

export function CaseListView({ onSelectCase }: { onSelectCase: (c: CaseRecord) => void }) {
  const [search, setSearch] = useState('');

  const filtered = MOCK_CASES.filter(c => 
    c.caseReference.toLowerCase().includes(search.toLowerCase()) || 
    c.wallet.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>LEA Case Dashboard</h2>
        <input 
          type="text"
          placeholder="Search by wallet or case ref..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff', width: 300 }}
        />
      </div>

      <div style={{ background: '#1a1a24', borderRadius: 12, overflow: 'hidden', border: '1px solid #333' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#222', borderBottom: '1px solid #333' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>Case Ref</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>Wallet</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>Date</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>VASP</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#aaa' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '12px 16px' }}>{c.caseReference}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#aaa' }}>
                  {c.wallet.substring(0, 8)}...{c.wallet.substring(c.wallet.length - 8)}
                </td>
                <td style={{ padding: '12px 16px' }}>{c.date}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    background: c.status === 'tracing' ? '#8a2be233' : 
                               c.status === 'attributed' ? '#ffa50033' :
                               c.status === 'prepared' ? '#32cd3233' : '#4169e133',
                    color: c.status === 'tracing' ? '#d8b4fe' : 
                           c.status === 'attributed' ? '#fcd34d' :
                           c.status === 'prepared' ? '#86efac' : '#93c5fd'
                  }}>
                    {c.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>{c.vasp || '-'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button 
                    onClick={() => onSelectCase(c)}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
