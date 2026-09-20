import React, { useState } from 'react';
import './government-dashboard.css';
import { AttributionView } from './views/AttributionView';
import { SahyogView } from './views/SahyogView';
import { DocketView } from './views/DocketView';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from '@tanstack/react-router';

export function GovernmentDashboardPage() {
  const [currentView, setCurrentView] = useState<'attribution' | 'docket' | 'sahyog'>('attribution');
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" as any, search: { redirect: "/government" } as any });
  };

  return (
    <div className="gov-dashboard-root">
      <div className="ambient">
        <div className="orb-a"></div>
        <div className="orb-b"></div>
        <div className="grid"></div>
      </div>

      <div className="advisory">
        Prototype · <b>SIH 2026 PS 26182</b> · Sample data, not an operational Government of India system
      </div>

      <div className="topbar">
        <a className="brand" href="/government">
          <span className="dot"></span>
          <b>Trace</b>
          <span>Investigation Console</span>
        </a>
        <div className="tb-right">
          <span className="agency">Cyber Crime Cell, Ahmedabad</span>
          <div className="who">
            <b>Insp. R. Parmar</b>
            <span>Senior analyst · ID 4471</span>
          </div>
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 ml-4 rounded-lg text-sm text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer border-none bg-transparent"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="shell">
        <aside>
          <h6>Investigation</h6>
          <button 
            onClick={() => setCurrentView('attribution')} 
            className={currentView === 'attribution' ? 'on' : ''}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            Attribution {currentView === 'attribution' && <span className="ct">↵</span>}
          </button>
          <button 
            onClick={() => setCurrentView('docket')} 
            className={currentView === 'docket' ? 'on' : ''}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            Case docket <span className="ct">14</span>
          </button>
          <button style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>
            Watchlist <span className="ct">37</span>
          </button>
          
          <h6>Filing</h6>
          <button 
            onClick={() => setCurrentView('sahyog')} 
            className={currentView === 'sahyog' ? 'on' : ''}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            SAHYOG queue <span className="ct">3</span>
          </button>
          <button style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>
            Dossiers <span className="ct">21</span>
          </button>
          <button style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>
            Summons drafts <span className="ct">5</span>
          </button>
          
          <h6>Unit</h6>
          <button style={{ display: 'flex', width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>Audit log</button>
          <button style={{ display: 'flex', width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>Analysts</button>
          <button style={{ display: 'flex', width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', background: 'transparent' }}>Methodology</button>
        </aside>

        <main style={{ minWidth: 0, padding: 0 }}>
          {currentView === 'attribution' && <AttributionView />}
          {currentView === 'docket' && (
            <div style={{ padding: "0 26px" }}>
              <DocketView />
            </div>
          )}
          {currentView === 'sahyog' && <SahyogView />}
        </main>
      </div>
    </div>
  );
}
