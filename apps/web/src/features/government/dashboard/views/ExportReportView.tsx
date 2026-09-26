import React, { useState } from 'react';

export function ExportReportView({ caseRecord }: { caseRecord: any }) {
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

  const handleExport = () => {
    setGenerating(true);
    // Stubbing PDF generation call
    setTimeout(() => {
      setGenerating(false);
      setDone(true);
    }, 2000);
  };

  return (
    <div style={{ padding: 24, color: '#fff', border: '1px solid #333', borderRadius: 12, marginTop: 24, background: '#1a1a24' }}>
      <h3 style={{ marginTop: 0, fontSize: 18 }}>Export Investigation Report</h3>
      <p style={{ color: '#aaa', fontSize: 14 }}>
        Generate a court-admissible PDF report containing trace evidence, fund flow graphs, and VASP attribution data for {caseRecord?.caseReference || 'this case'}.
      </p>

      {done ? (
        <div style={{ padding: 16, background: '#32cd3222', color: '#86efac', borderRadius: 8, border: '1px solid #32cd3255' }}>
          Report generated successfully! <a href="#" style={{ color: '#fff', textDecoration: 'underline' }}>Download PDF</a>
        </div>
      ) : (
        <button 
          onClick={handleExport}
          disabled={generating}
          style={{ 
            background: generating ? '#555' : '#3b82f6', 
            color: '#fff', 
            border: 'none', 
            padding: '10px 20px', 
            borderRadius: 6, 
            cursor: generating ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {generating ? 'Generating PDF...' : 'Generate PDF Report'}
        </button>
      )}

      <div style={{ marginTop: 24, borderTop: '1px solid #333', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 16px 0' }}>Report Preview</h4>
        <div style={{ background: '#fff', color: '#000', padding: 32, borderRadius: 8, height: 400, overflowY: 'auto' }}>
          <h1 style={{ textAlign: 'center', margin: 0 }}>CONFIDENTIAL INVESTIGATION REPORT</h1>
          <h3 style={{ textAlign: 'center', margin: '8px 0 24px 0', color: '#555' }}>{caseRecord?.caseReference || 'NCRP-XXXX'}</h3>
          <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
          <p><strong>Subject Wallet:</strong> {caseRecord?.wallet || '0x...'}</p>
          <p><strong>Status:</strong> {caseRecord?.status || 'Unknown'}</p>
          <p><strong>Attributed VASP:</strong> {caseRecord?.vasp || 'None'}</p>
          <hr style={{ margin: '24px 0' }}/>
          <h4>Executive Summary</h4>
          <p>This document contains the tracing evidence and funds flow analysis conducted for the aforementioned case.</p>
          <div style={{ background: '#eee', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '24px 0' }}>
            [ Graph Visualization Placeholder ]
          </div>
        </div>
      </div>
    </div>
  );
}
