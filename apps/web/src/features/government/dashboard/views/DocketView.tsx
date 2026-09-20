export function DocketView() {
  return (
    <div className="panel" style={{ marginTop: "16px", marginBottom: "80px" }}>
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
  );
}
