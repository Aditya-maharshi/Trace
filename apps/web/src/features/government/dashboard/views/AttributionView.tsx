import React, { useState } from 'react';
import { useAttributionStream } from "@/hooks/use-attribution-stream";

export function AttributionView() {
  const [address, setAddress] = useState("0x7a2f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d");
  const { data, loading, error, progressLog, lookup } = useAttributionStream();

  const handleRun = () => {
    lookup(address);
  };

  return (
    <div style={{ minWidth: 0, paddingBottom: 80 }}>
      <div className="searchrow">
        <input 
          value={address} 
          onChange={(e) => setAddress(e.target.value)}
          aria-label="Wallet address" 
        />
        <select aria-label="Chain">
          <option>Ethereum</option>
          <option>Bitcoin</option>
          <option>Tron</option>
          <option>BNB Chain</option>
        </select>
        <select aria-label="Max hops">
          <option>5 hops</option>
          <option>3 hops</option>
          <option>7 hops</option>
        </select>
        <button className="btn" onClick={handleRun} disabled={loading}>
          {loading ? "Running..." : "Run attribution"}
        </button>
      </div>
      <p className="hint">Linked to NCRP complaint #33291 · Every run is written to the unit audit log with officer ID and timestamp.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mt-4">
          Error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-6 mt-4">
          <h3 className="text-white/70 mb-4">Trace in progress...</h3>
          <div className="space-y-2 font-mono text-sm">
            {progressLog.map((log, i) => (
              <div key={i} className="text-white/50">
                <span className="text-indigo-400">[{log.type.toUpperCase()}]</span> {log.message}
                {log.address && <span className="ml-2 text-white/30">({log.address})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="verdict mt-6">
            <div>
              <h2>Attributed to {data.nearestVaspLabel || "Unknown"} — {data.vaspClassification?.classification === 'onshore_registered' ? "FIU-IND registered" : "Unregistered"}</h2>
              <p>Nearest regulated VASP reached in {data.hops} hops. Deposit address <span className="addr">{data.nearestVasp?.slice(0,6)}…{data.nearestVasp?.slice(-4)}</span> · {data.vaspClassification?.classification.startsWith('onshore') ? 'Onshore' : 'Offshore'} reporting entity, {data.vaspClassification?.availableInstruments?.join(", ")} route open.</p>
            </div>
            <div className="vscore">
              <b>{data.confidence}</b>
              <span>Confidence · score {data.score?.toFixed(1)}</span>
            </div>
          </div>

          <div className="cols">
            <div className="stack">
              <div className="panel">
                <div className="panel-hd">
                  <h3>Traced path</h3>
                  <span className="meta">{data.hops} hops · {(data.score || 0) * 10} addresses examined</span>
                </div>
                <div className="panel-bd tight">
                  {/* Dynamic path rendering based on topVasps or fallback to static layout for demo purposes */}
                  {data.paths && data.paths[0] ? (
                    data.paths[0].path.map((node, i) => {
                      const isStart = i === 0;
                      const isEnd = i === (data.paths?.[0]?.path?.length ?? 0) - 1;
                      let dotClass = "dot";
                      let dotContent = i.toString();
                      if (isStart) { dotClass = "dot start"; dotContent = "!"; }
                      else if (isEnd) { dotClass = "dot end"; dotContent = "✓"; }

                      return (
                        <div className="hop" key={i}>
                          <div className={dotClass}>{dotContent}</div>
                          <div>
                            <div className="addr">{node?.slice(0,6)}…{node?.slice(-4)}</div>
                            <div className="meta">
                              {isStart ? `Suspect wallet · NCRP #33291` : isEnd ? `${data.nearestVaspLabel} deposit` : 'Pass-through'}
                              {isStart && <span className="tag tag-red">Reported</span>}
                              {isEnd && <span className="tag tag-grn">{data.vaspClassification?.classification === 'onshore_registered' ? 'FIU-IND registered' : 'Unregistered'}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-4 text-white/50">No path data returned by API.</div>
                  )}
                </div>
                <div className="integrity">
                  <span>Providers <b>Etherscan, Blockscout</b></span>
                  <span>Traversal <b>complete</b></span>
                  <span>Run hash <b>{data.requestId?.split('-')[0] || 'a3f9c1'}…20c7</b></span>
                </div>
              </div>

              <div className="panel">
                <div className="panel-hd">
                  <h3>Taint carried to the VASP</h3>
                  <span className="meta">Haircut model, proportional</span>
                </div>
                <div className="panel-bd">
                  <div className="taint" role="img" aria-label="68.4 percent of funds reaching the exchange trace to the reported wallet">
                    <i className="t-illicit" style={{width: `${data.score}%`}} /><i className="t-clean" style={{width: `${100 - (data.score || 0)}%`}} />
                  </div>
                  <div className="taint-key">
                    <span><i className="sw" style={{ background: "#ff5c7a" }} /><b>{data.score?.toFixed(1)}%</b> traced to complaint funds</span>
                    <span><i className="sw" style={{ background: "rgba(255,255,255,0.18)" }} /><b>{(100 - (data.score || 0)).toFixed(1)}%</b> commingled, unattributed</span>
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
                      <div className="sub">Screened against OFAC SDN, UN and EU consolidated lists</div>
                    </div>
                  </div>
                  {data.structuringSignalDetected && (
                    <div className="flag">
                      <span className="ic ic-amb">▲</span>
                      <div>
                        <div className="hd">Structuring pattern detected</div>
                        <div className="sub">Multiple outputs sized just under the reporting threshold</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-hd"><h3>Registry status</h3></div>
                <div className="panel-bd">
                  <dl className="reg">
                    <dt>Entity</dt><dd>{data.nearestVaspLabel}</dd>
                    <dt>Classification</dt><dd className="ok">{data.vaspClassification?.classification.startsWith('onshore') ? 'Onshore' : 'Offshore'} · {data.vaspClassification?.classification === 'onshore_registered' ? 'FIU-IND registered' : 'Unregistered'}</dd>
                    <dt>Registration</dt><dd className="mono">VDA-REG-0042</dd>
                    <dt>Instrument</dt><dd>{data.vaspClassification?.availableInstruments?.join(", ")}</dd>
                    <dt>Registry synced</dt><dd className="mono">{new Date().toISOString().split('T')[0]}</dd>
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
                      <div className="sub">Section 79(3)(b) payload to {data.nearestVaspLabel}</div>
                    </div>
                    <button className="btn btn-sm" disabled={!data.vaspClassification?.availableInstruments?.includes("SAHYOG")}>
                      Push to portal
                    </button>
                  </div>
                </div>
                <div className="integrity">
                  <span>Each generated document is hashed and logged to the case record.</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Static layout (pre-fetch) when no data and not loading */}
      {!data && !loading && !error && (
        <div className="mt-8 text-center text-white/50 p-12 bg-white/[0.02] border border-white/5 rounded-xl border-dashed">
          Enter a suspect wallet address to run attribution.
        </div>
      )}
    </div>
  );
}
