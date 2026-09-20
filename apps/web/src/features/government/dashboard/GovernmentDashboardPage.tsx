import React from 'react';
import './government-dashboard.css';
import { Link } from '@tanstack/react-router';

export function GovernmentDashboardPage() {
  return (
    <div className="gov-dashboard-root">
      {/* Ported directly from government dashboard.html */}
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
  </div>
</div>

<div className="shell">
  <aside>
    <h6>Investigation</h6>
    <a href="/" className="on">Attribution <span className="ct">↵</span></a>
    <a href="/">Case docket <span className="ct">14</span></a>
    <a href="/">Watchlist <span className="ct">37</span></a>
    <h6>Filing</h6>
    <a href="/">SAHYOG queue <span className="ct">3</span></a>
    <a href="/">Dossiers <span className="ct">21</span></a>
    <a href="/">Summons drafts <span className="ct">5</span></a>
    <h6>Unit</h6>
    <a href="/">Audit log</a>
    <a href="/">Analysts</a>
    <a href="/">Methodology</a>
  </aside>

  <main>
    <div className="searchrow">
      <input value="0x7a2f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d" aria-label="Wallet address" />
      <select aria-label="Chain"><option>Ethereum</option><option>Bitcoin</option><option>Tron</option><option>BNB Chain</option></select>
      <select aria-label="Max hops"><option>5 hops</option><option>3 hops</option><option>7 hops</option></select>
      <button className="btn">Run attribution</button>
    </div>
    <p className="hint">Linked to NCRP complaint #33291 · Every run is written to the unit audit log with officer ID and timestamp.</p>

    <div className="verdict">
      <div>
        <h2>Attributed to Binance — FIU-IND registered</h2>
        <p>Nearest regulated VASP reached in 3 hops. Deposit address <span className="addr">0x3f5ce5fb…c936f0be</span> · Onshore reporting entity, SAHYOG route open.</p>
      </div>
      <div className="vscore">
        <b>High</b>
        <span>Confidence · score 87.3</span>
      </div>
    </div>

    <div className="cols">
      
      <div className="stack">
        <div className="panel">
          <div className="panel-hd">
            <h3>Traced path</h3>
            <span className="meta">3 hops · 412 addresses examined · 41s</span>
          </div>
          <div className="panel-bd tight">
            <div className="hop">
              <div className="dot start">!</div>
              <div>
                <div className="addr">0x7a2f…c41d</div>
                <div className="meta">Suspect wallet · NCRP #33291 · ₹58.6L received<span className="tag tag-red">Reported</span></div>
              </div>
            </div>
            <div className="hop">
              <div className="dot">1</div>
              <div>
                <div className="addr">0x1c88…9ba2</div>
                <div className="meta">Pass-through · ₹41.2L forwarded · 6 min dwell</div>
              </div>
            </div>
            <div className="hop">
              <div className="dot warn">2</div>
              <div>
                <div className="addr">0xd90f…77e5</div>
                <div className="meta">Split across 4 outputs below reporting threshold<span className="tag tag-amb">Structuring</span></div>
              </div>
            </div>
            <div className="hop">
              <div className="dot end">✓</div>
              <div>
                <div className="addr">0x3f5c…f0be</div>
                <div className="meta">Binance deposit address<span className="tag tag-grn">FIU-IND registered</span><span className="tag tag-blu">Ground truth</span></div>
              </div>
            </div>
          </div>
          <div className="integrity">
            <span>Providers <b>Etherscan, Blockscout</b></span>
            <span>Traversal <b>complete</b></span>
            <span>Run hash <b>a3f9c1…20c7</b></span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h3>Taint carried to the VASP</h3>
            <span className="meta">Haircut model, proportional</span>
          </div>
          <div className="panel-bd">
            <div className="taint" role="img" aria-label="68.4 percent of funds reaching the exchange trace to the reported wallet">
              <i className="t-illicit" /><i className="t-clean" />
            </div>
            <div className="taint-key">
              <span><i className="sw" style={{ background: "#ff5c7a" }} /><b>68.4%</b> traced to complaint funds</span>
              <span><i className="sw" style={{ background: "rgba(255,255,255,0.18)" }} /><b>31.6%</b> commingled, unattributed</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd"><h3>Findings on this trace</h3></div>
          <div className="panel-bd">
            <div className="flag">
              <span className="ic ic-grn">✓</span>
              <div>
                <div className="hd">No sanctions-list match on any address in the path</div>
                <div className="sub">Screened against OFAC SDN, UN and EU consolidated lists · list version 2026-09-12</div>
              </div>
            </div>
            <div className="flag">
              <span className="ic ic-amb">▲</span>
              <div>
                <div className="hd">Structuring pattern at hop 2</div>
                <div className="sub">Four outputs sized just under the ₹10L reporting threshold, within 90 seconds</div>
              </div>
            </div>
            <div className="flag">
              <span className="ic ic-blu">i</span>
              <div>
                <div className="hd">CoinJoin filter applied before clustering</div>
                <div className="sub">One collaborative-spend transaction was severed to prevent a false entity merge</div>
              </div>
            </div>
            <div className="flag">
              <span className="ic ic-blu">i</span>
              <div>
                <div className="hd">No cross-chain bridge exit detected on this path</div>
                <div className="sub">Funds remained on Ethereum through all three hops</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      
      <div className="stack">
        <div className="panel">
          <div className="panel-hd"><h3>Registry status</h3></div>
          <div className="panel-bd">
            <dl className="reg">
              <dt>Entity</dt><dd>Binance</dd>
              <dt>Classification</dt><dd className="ok">Onshore · FIU-IND registered</dd>
              <dt>Registration</dt><dd className="mono">VDA-REG-0042</dd>
              <dt>Instrument</dt><dd>Section 79(3)(b) via SAHYOG</dd>
              <dt>Registry synced</dt><dd className="mono">2026-09-14</dd>
            </dl>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h3>Statutory output</h3>
            <span className="meta">Generated from this run</span>
          </div>
          <div className="panel-bd">
            <div className="act">
              <div>
                <div className="lbl">BSA Section 63 certificate</div>
                <div className="sub">Part A and Part B, dossier hash embedded</div>
              </div>
              <button className="btn btn-line btn-sm">Generate</button>
            </div>
            <div className="act">
              <div>
                <div className="lbl">BNSS Section 94 summons</div>
                <div className="sub">KYC production order, pre-filled</div>
              </div>
              <button className="btn btn-line btn-sm">Draft</button>
            </div>
            <div className="act">
              <div>
                <div className="lbl">SAHYOG freeze request</div>
                <div className="sub">Section 79(3)(b) payload to Binance</div>
              </div>
              <button className="btn btn-sm">Push to portal</button>
            </div>
            <div className="act">
              <div>
                <div className="lbl">IVMS101 payload</div>
                <div className="sub">Travel Rule schema for counterpart VASP</div>
              </div>
              <button className="btn btn-line btn-sm">Export</button>
            </div>
          </div>
          <div className="integrity">
            <span>Each generated document is hashed and logged to the case record.</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd"><h3>Attach to case</h3></div>
          <div className="panel-bd">
            <div className="act">
              <div>
                <div className="lbl">CASE/2026/AHM/0412</div>
                <div className="sub">Wallet drainer cluster · 6 linked wallets</div>
              </div>
              <span className="done">Pinned</span>
            </div>
            <div className="act">
              <div>
                <div className="lbl">Pin this path as evidence</div>
                <div className="sub">Snapshot is hashed at pin time and drift-checked on export</div>
              </div>
              <button className="btn btn-line btn-sm">Pin</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="panel" style={{ marginTop: "16px" }}>
      <div className="panel-hd">
        <h3>Case docket — Cyber Crime Cell, Ahmedabad</h3>
        <span className="meta">14 open · 2 breaching SLA</span>
      </div>
      <div className="panel-bd">
        <div className="board">
          <div className="col">
            <h5><span>New lead</span><span>4</span></h5>
            <div className="card">
              <div className="cno">CASE/2026/AHM/0418</div>
              <div className="ttl">Unhosted wallet, ₹12.4L</div>
              <div className="foot"><span>NCRP #33410</span><span>2h in state</span></div>
            </div>
            <div className="card">
              <div className="cno">CASE/2026/AHM/0419</div>
              <div className="ttl">P2P escrow fraud</div>
              <div className="foot"><span>NCRP #33452</span><span>5h in state</span></div>
            </div>
          </div>
          <div className="col">
            <h5><span>Under review</span><span>6</span></h5>
            <div className="card sla">
              <div className="cno">CASE/2026/AHM/0412</div>
              <div className="ttl">Wallet drainer cluster</div>
              <div className="foot"><span>6 wallets</span><span className="br">SLA 44h</span></div>
            </div>
            <div className="card">
              <div className="cno">CASE/2026/AHM/0407</div>
              <div className="ttl">Betting syndicate payout</div>
              <div className="foot"><span>Tron</span><span>19h in state</span></div>
            </div>
          </div>
          <div className="col">
            <h5><span>Escalated</span><span>3</span></h5>
            <div className="card esc">
              <div className="cno">CASE/2026/AHM/0398</div>
              <div className="ttl">Sanctioned path detected</div>
              <div className="foot"><span>Auto-escalated</span><span className="br">SLA 26h</span></div>
            </div>
            <div className="card esc">
              <div className="cno">CASE/2026/AHM/0391</div>
              <div className="ttl">Offshore, non-compliant VASP</div>
              <div className="foot"><span>MLAT prepared</span><span>11h in state</span></div>
            </div>
          </div>
          <div className="col">
            <h5><span>Filed</span><span>1</span></h5>
            <div className="card">
              <div className="cno">CASE/2026/AHM/0377</div>
              <div className="ttl">Freeze served, funds held</div>
              <div className="foot"><span>SAHYOG ack</span><span>Closed</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
    </div>
  );
}
