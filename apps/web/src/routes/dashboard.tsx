import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BfsProgressFeed } from "@/components/dashboard/BfsProgressFeed";
import { ResultCard } from "@/components/dashboard/ResultCard";
import { useAttributionStream } from "@/hooks/use-attribution-stream";
import { supabase } from "@/integrations/supabase/client";
import { getConfig } from "@/lib/api";
import { initCommercialConsole } from "@/lib/commercial-console-script";
import "@/styles/commercial-console.css";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Trace — Compliance Console" },
      {
        name: "description",
        content:
          "Screen wallets, review risk alerts and manage your organization's attribution workflow.",
      },
      { property: "og:title", content: "Trace — Compliance Console" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data, narrative, loading, error, progressLog, lookup } = useAttributionStream();

  useEffect(() => {
    getConfig()
      .then((c) => setIsDemoMode(c.isDemoMode))
      .catch(console.error);

    if (localStorage.getItem("trace_guest_session")) {
      const demoProvider = localStorage.getItem("trace_demo_provider");
      setUserEmail(demoProvider ? `${demoProvider} demo analyst` : "guest analyst");
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) setUserEmail(user.email);
      });
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("trace_guest_session")) {
      setCheckedAuth(true);
      return;
    }

    supabase.auth.getSession().then((res) => {
      if (res.data.session) {
        setCheckedAuth(true);
      } else {
        const hasAuthParams =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token") ||
            window.location.search.includes("code="));
        if (!hasAuthParams) navigate({ to: "/login" });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCheckedAuth(true);
      } else if (!localStorage.getItem("trace_guest_session")) {
        navigate({ to: "/login" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !checkedAuth) return;
    return initCommercialConsole(root);
  }, [checkedAuth]);

  async function signOut() {
    localStorage.removeItem("trace_guest_session");
    localStorage.removeItem("trace_demo_provider");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  if (!checkedAuth) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin" />
          <p className="text-white/40 text-sm">Authenticating…</p>
        </div>
      </div>
    );
  }

  return (
    <div id="trace-commercial-console" ref={rootRef}>
      <div className="ambient">
        <div className="orb-a"></div>
        <div className="orb-b"></div>
      </div>

      <div className="advisory">
        Prototype · <b>SIH 2026 PS 26182</b> · Sample data, commercial/VASP console
      </div>

      <div className="topbar">
        <Link className="brand" to="/">
          <span className="dot"></span>
          <b>Trace</b>
          <span>Compliance Console</span>
        </Link>
        <div className="tb-right">
          <span className="orgtag">Nova Pay Exchange · VASP</span>
          <div className="who">
            <b>{userEmail ?? "A. Mehta"}</b>
            <span>Compliance Officer</span>
          </div>
          <button type="button" className="signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="shell">
        <aside>
          <h6>Screening</h6>
          <a data-page="overview" className="on">
            Overview
          </a>
          <a data-page="screen">Screen a wallet</a>
          <a data-page="batch">Batch screening</a>
          <a data-page="alerts">
            Risk alerts <span className="ct alert">3</span>
          </a>
          <a data-page="history">
            Screening history <span className="ct">128</span>
          </a>
          <h6>Developer</h6>
          <a data-page="api">API &amp; integration</a>
          <h6>Organization</h6>
          <a data-page="team">Team &amp; plan</a>
        </aside>

        <main>
          {/*================= OVERVIEW =================*/}
          <section className="page on" id="page-overview">
            <div className="page-hd">
              <h1>Overview</h1>
              <p>Snapshot of your org's screening activity. Nova Pay Exchange · Growth plan.</p>
            </div>

            <div className="stats">
              <div className="stat">
                <div className="lbl">Screened today</div>
                <div className="val">47</div>
                <div className="delta up">↑ 12% vs yesterday</div>
              </div>
              <div className="stat">
                <div className="lbl">Open risk alerts</div>
                <div className="val" style={{ color: "var(--red)" }}>
                  3
                </div>
                <div className="delta warn">2 sanctioned-list matches</div>
              </div>
              <div className="stat">
                <div className="lbl">API calls this month</div>
                <div className="val">8,214</div>
                <div className="delta">of 25,000 included</div>
              </div>
              <div className="stat">
                <div className="lbl">Avg. screening time</div>
                <div className="val">1.8s</div>
                <div className="delta up">Within SLA</div>
              </div>
            </div>

            <div className="cols" style={{ marginTop: "16px" }}>
              <div className="panel">
                <div className="panel-hd">
                  <h3>Recent screenings</h3>
                  <span className="meta">Last 24 hours</span>
                </div>
                <div className="panel-bd flush">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Wallet</th>
                          <th>Risk</th>
                          <th>Matched VASP</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="mono">0x9f2a…41bc</td>
                          <td>
                            <span className="risk-pill risk-low">Low</span>
                          </td>
                          <td>Coinbase</td>
                          <td className="mono">2 min ago</td>
                        </tr>
                        <tr>
                          <td className="mono">0x3e71…8d02</td>
                          <td>
                            <span className="risk-pill risk-high">High</span>
                          </td>
                          <td>Unhosted</td>
                          <td className="mono">19 min ago</td>
                        </tr>
                        <tr>
                          <td className="mono">0x0c4f…aa19</td>
                          <td>
                            <span className="risk-pill risk-low">Low</span>
                          </td>
                          <td>Binance</td>
                          <td className="mono">44 min ago</td>
                        </tr>
                        <tr>
                          <td className="mono">0x7bd2…ff3e</td>
                          <td>
                            <span className="risk-pill risk-med">Medium</span>
                          </td>
                          <td>Unclassified</td>
                          <td className="mono">1h ago</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Quick action</h3>
                  </div>
                  <div className="panel-bd">
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--text-dim)",
                        lineHeight: "1.6",
                        margin: "0 0 14px",
                      }}
                    >
                      Screen a new wallet before onboarding or clearing a transaction.
                    </p>
                    <button className="btn" style={{ width: "100%" }} data-goto="screen">
                      Screen a wallet
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Plan usage</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="plan-row">
                      <span>API calls</span>
                      <b>8,214 / 25,000</b>
                    </div>
                    <div className="usagebar">
                      <i style={{ width: "33%" }}></i>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-faint)", margin: "12px 0 0" }}>
                      Resets in 14 days ·{" "}
                      <a href="#" data-goto="team" style={{ color: "var(--eth)" }}>
                        manage plan
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/*================= SCREEN A WALLET =================*/}
          <section className="page" id="page-screen">
            <div className="page-hd">
              <h1>Screen a wallet</h1>
              <p>
                Run attribution and risk screening on a single wallet before onboarding or clearing
                a transaction. Nothing here touches case management or statutory workflows — this is
                a screening-only view.
              </p>
            </div>

            <form
              className="searchrow"
              onSubmit={(e) => {
                e.preventDefault();
                const address = query.trim();
                if (address) lookup(address);
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Wallet address"
                placeholder="0x…"
              />
              <select aria-label="Chain">
                <option>Ethereum</option>
                <option>Bitcoin</option>
                <option>Tron</option>
                <option>BNB Chain</option>
              </select>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? "Screening…" : "Run screening"}
              </button>
            </form>
            <p className="hint">
              Results are org-scoped and logged to your screening history automatically.
            </p>

            {(loading || error || data) && (
              <div className="panel live-screening">
                <div className="panel-hd">
                  <h3>Live attribution</h3>
                  <span className="meta">{isDemoMode ? "Demo data" : "Attribution engine"}</span>
                </div>
                <div className="panel-bd">
                  {error && <p className="hint">{error}</p>}
                  {loading && <BfsProgressFeed messages={progressLog} />}
                  {data && <ResultCard data={data} narrative={narrative} />}
                </div>
              </div>
            )}

            <div className="verdict risk">
              <div>
                <h2>High risk — sanctioned-list match</h2>
                <p>
                  Address <span className="addr">0x3e71…8d02</span> matched an OFAC SDN entry at hop
                  2. Recommend blocking onboarding pending manual review.
                </p>
              </div>
              <div className="vscore">
                <b>High</b>
                <span>Risk score · 91.2</span>
              </div>
            </div>

            <div className="cols">
              <div className="stack">
                <div className="panel view-swap" id="pathPanel">
                  <div className="panel-hd">
                    <h3>Traced path</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span className="meta">2 hops · 96 addresses examined · 9s</span>
                      <div className="graph-toggle">
                        <button className="on" data-pathview="graph">
                          Graph
                        </button>
                        <button data-pathview="list">List</button>
                      </div>
                    </div>
                  </div>

                  {/*Graph view — node/edge visualization (mirrors the AttributionGraph component)*/}
                  <div className="panel-bd graph-view">
                    <svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <marker
                          id="arrow"
                          viewBox="0 0 10 10"
                          refX="9"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.35)" />
                        </marker>
                      </defs>
                      <line
                        x1="95"
                        y1="95"
                        x2="285"
                        y2="95"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow)"
                      />
                      <line
                        x1="355"
                        y1="95"
                        x2="545"
                        y2="95"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow)"
                      />
                      <text x="190" y="82" textAnchor="middle" className="gedge-label">
                        0.4 ETH
                      </text>
                      <text x="450" y="82" textAnchor="middle" className="gedge-label">
                        0.38 ETH
                      </text>

                      <circle
                        cx="60"
                        cy="95"
                        r="26"
                        fill="rgba(255,92,122,0.14)"
                        stroke="#ff5c7a"
                        strokeWidth="1.5"
                      />
                      <text
                        x="60"
                        y="100"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                        fontSize="13"
                        fill="#ff5c7a"
                      >
                        !
                      </text>
                      <text x="60" y="138" textAnchor="middle" className="gnode-label">
                        0x3e71…8d02
                      </text>
                      <text x="60" y="152" textAnchor="middle" className="gnode-sub">
                        Sanctioned
                      </text>

                      <circle
                        cx="320"
                        cy="95"
                        r="26"
                        fill="rgba(240,180,41,0.14)"
                        stroke="#f0b429"
                        strokeWidth="1.5"
                      />
                      <text
                        x="320"
                        y="100"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                        fontSize="13"
                        fill="#f0b429"
                      >
                        1
                      </text>
                      <text x="320" y="138" textAnchor="middle" className="gnode-label">
                        0x88a0…44f1
                      </text>
                      <text x="320" y="152" textAnchor="middle" className="gnode-sub">
                        Mixer-adjacent
                      </text>

                      <circle
                        cx="580"
                        cy="95"
                        r="26"
                        fill="rgba(140,157,252,0.14)"
                        stroke="#8c9dfc"
                        strokeWidth="1.5"
                      />
                      <text
                        x="580"
                        y="100"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                        fontSize="13"
                        fill="#8c9dfc"
                      >
                        ✓
                      </text>
                      <text x="580" y="138" textAnchor="middle" className="gnode-label">
                        Unhosted
                      </text>
                      <text x="580" y="152" textAnchor="middle" className="gnode-sub">
                        Terminal node
                      </text>
                    </svg>
                    <p className="hint" style={{ padding: "0 12px 14px" }}>
                      Drag to pan, scroll to zoom in the live component — this mockup shows a static
                      frame.
                    </p>
                  </div>

                  {/*List view — same data as a linear hop breakdown*/}
                  <div className="panel-bd tight list-view">
                    <div className="hop">
                      <div className="dot start">!</div>
                      <div>
                        <div className="addr">0x3e71…8d02</div>
                        <div className="meta">
                          Wallet under review<span className="tag tag-red">Sanctioned match</span>
                        </div>
                      </div>
                    </div>
                    <div className="hop">
                      <div className="dot warn">1</div>
                      <div>
                        <div className="addr">0x88a0…44f1</div>
                        <div className="meta">
                          Pass-through, 2 min dwell
                          <span className="tag tag-amb">Mixer-adjacent</span>
                        </div>
                      </div>
                    </div>
                    <div className="hop">
                      <div className="dot end">✓</div>
                      <div>
                        <div className="addr">Unhosted wallet</div>
                        <div className="meta">
                          No VASP match at this depth
                          <span className="tag tag-blu">Terminal node</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="integrity">
                    <span>
                      Providers <b>Etherscan, Blockscout</b>
                    </span>
                    <span>
                      Traversal <b>complete</b>
                    </span>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-hd">
                    <h3>Findings</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="flag">
                      <span className="ic ic-red">✕</span>
                      <div>
                        <div className="hd">Sanctions-list match on the origin address</div>
                        <div className="sub">
                          Screened against OFAC SDN, UN and EU consolidated lists · list version
                          2026-09-12
                        </div>
                      </div>
                    </div>
                    <div className="flag">
                      <span className="ic ic-amb">▲</span>
                      <div>
                        <div className="hd">Mixer-adjacent hop detected</div>
                        <div className="sub">
                          Intermediate address has prior exposure to a known mixing service
                        </div>
                      </div>
                    </div>
                    <div className="flag">
                      <span className="ic ic-blu">i</span>
                      <div>
                        <div className="hd">No VASP attribution at current hop depth</div>
                        <div className="sub">
                          Increase max hops to continue tracing toward a regulated exchange
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Recommended action</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="act">
                      <div>
                        <div className="lbl">Block onboarding</div>
                        <div className="sub">Prevent this wallet from completing sign-up</div>
                      </div>
                      <button className="btn btn-sm">Block</button>
                    </div>
                    <div className="act">
                      <div>
                        <div className="lbl">Send to manual review</div>
                        <div className="sub">Escalate to a senior compliance reviewer</div>
                      </div>
                      <button className="btn btn-line btn-sm">Escalate</button>
                    </div>
                    <div className="act">
                      <div>
                        <div className="lbl">Export screening report</div>
                        <div className="sub">PDF/CSV for your internal audit file</div>
                      </div>
                      <button className="btn btn-line btn-sm">Export</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/*================= BATCH SCREENING =================*/}
          <section className="page" id="page-batch">
            <div className="page-hd">
              <h1>Batch screening</h1>
              <p>
                Upload a CSV of wallet addresses to screen an onboarding cohort at once, instead of
                one address at a time.
              </p>
            </div>

            <div className="panel">
              <div className="panel-bd">
                <div className="dropzone">
                  <div className="ico">⇧</div>
                  <div className="ttl">Drop a CSV file, or click to browse</div>
                  <div className="sub">One address per row · up to 5,000 rows · .csv only</div>
                </div>
                <p className="hint">
                  Need a template?{" "}
                  <a href="#" style={{ color: "var(--eth)" }}>
                    Download sample CSV
                  </a>
                </p>
              </div>
            </div>

            <div className="panel" style={{ marginTop: "16px" }}>
              <div className="panel-hd">
                <h3>Recent batches</h3>
                <span className="meta">2 in progress</span>
              </div>
              <div className="panel-bd flush">
                <div className="batch-row">
                  <div>
                    <div className="lbl" style={{ fontSize: "13.5px" }}>
                      onboarding_cohort_sept.csv
                    </div>
                    <div className="sub" style={{ fontSize: "12px", color: "var(--text-faint)" }}>
                      2,140 addresses · 2 high risk found
                    </div>
                  </div>
                  <div className="progress">
                    <i style={{ width: "100%" }}></i>
                  </div>
                  <span className="done">Complete</span>
                </div>
                <div className="batch-row">
                  <div>
                    <div className="lbl" style={{ fontSize: "13.5px" }}>
                      partner_referral_list.csv
                    </div>
                    <div className="sub" style={{ fontSize: "12px", color: "var(--text-faint)" }}>
                      640 of 900 screened
                    </div>
                  </div>
                  <div className="progress">
                    <i style={{ width: "71%" }}></i>
                  </div>
                  <span className="done pending">Processing</span>
                </div>
              </div>
            </div>
          </section>

          {/*================= RISK ALERTS =================*/}
          <section className="page" id="page-alerts">
            <div className="page-hd">
              <h1>Risk alerts</h1>
              <p>
                Wallets flagged by screening that need a compliance decision. This list is separate
                from your full history so nothing urgent gets buried.
              </p>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h3>Open alerts</h3>
                <span className="meta">3 open</span>
              </div>
              <div className="panel-bd flush">
                <div className="alert-row">
                  <span className="ic ic-red">✕</span>
                  <div>
                    <div className="addr">0x3e71…8d02</div>
                    <div className="sub">Sanctions-list match · flagged 19 min ago</div>
                  </div>
                  <div className="alert-actions">
                    <button className="btn btn-line btn-sm">Review</button>
                    <button className="btn btn-sm">Block</button>
                  </div>
                </div>
                <div className="alert-row">
                  <span className="ic ic-amb">▲</span>
                  <div>
                    <div className="addr">0x7bd2…ff3e</div>
                    <div className="sub">
                      Unclassified counterparty, medium risk · flagged 1h ago
                    </div>
                  </div>
                  <div className="alert-actions">
                    <button className="btn btn-line btn-sm">Review</button>
                    <button className="btn btn-sm">Clear</button>
                  </div>
                </div>
                <div className="alert-row">
                  <span className="ic ic-amb">▲</span>
                  <div>
                    <div className="addr">0xaa41…20e7</div>
                    <div className="sub">Mixer-adjacent hop detected · flagged 3h ago</div>
                  </div>
                  <div className="alert-actions">
                    <button className="btn btn-line btn-sm">Review</button>
                    <button className="btn btn-sm">Clear</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/*================= HISTORY =================*/}
          <section className="page" id="page-history">
            <div className="page-hd">
              <h1>Screening history</h1>
              <p>
                Full log of every screening your org has run, for internal audit and regulator
                requests.
              </p>
            </div>

            <div className="searchrow" style={{ marginBottom: "16px" }}>
              <input placeholder="Filter by wallet address" aria-label="Filter" />
              <select aria-label="Risk filter">
                <option>All risk levels</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <button className="btn btn-line">Export CSV</button>
            </div>

            <div className="panel">
              <div className="panel-bd flush">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Risk</th>
                        <th>Matched VASP</th>
                        <th>Analyst</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="mono">0x9f2a…41bc</td>
                        <td>
                          <span className="risk-pill risk-low">Low</span>
                        </td>
                        <td>Coinbase</td>
                        <td>A. Mehta</td>
                        <td className="mono">2026-09-18 14:02</td>
                      </tr>
                      <tr>
                        <td className="mono">0x3e71…8d02</td>
                        <td>
                          <span className="risk-pill risk-high">High</span>
                        </td>
                        <td>Unhosted</td>
                        <td>A. Mehta</td>
                        <td className="mono">2026-09-18 13:44</td>
                      </tr>
                      <tr>
                        <td className="mono">0x0c4f…aa19</td>
                        <td>
                          <span className="risk-pill risk-low">Low</span>
                        </td>
                        <td>Binance</td>
                        <td>R. Iyer</td>
                        <td className="mono">2026-09-18 13:19</td>
                      </tr>
                      <tr>
                        <td className="mono">0x7bd2…ff3e</td>
                        <td>
                          <span className="risk-pill risk-med">Medium</span>
                        </td>
                        <td>Unclassified</td>
                        <td>R. Iyer</td>
                        <td className="mono">2026-09-18 13:05</td>
                      </tr>
                      <tr>
                        <td className="mono">0x61ec…0b7a</td>
                        <td>
                          <span className="risk-pill risk-low">Low</span>
                        </td>
                        <td>Kraken</td>
                        <td>A. Mehta</td>
                        <td className="mono">2026-09-18 11:52</td>
                      </tr>
                      <tr>
                        <td className="mono">0xaa41…20e7</td>
                        <td>
                          <span className="risk-pill risk-med">Medium</span>
                        </td>
                        <td>Unclassified</td>
                        <td>A. Mehta</td>
                        <td className="mono">2026-09-18 10:31</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/*================= API & INTEGRATION =================*/}
          <section className="page" id="page-api">
            <div className="page-hd">
              <h1>API &amp; integration</h1>
              <p>Plug wallet screening directly into your own onboarding flow.</p>
            </div>

            <div className="cols">
              <div className="stack">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Your API key</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="key-box">
                      <code>trace_live_sk_••••••••••••••••••••7f3a</code>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn btn-line btn-sm">Copy</button>
                        <button className="btn btn-line btn-sm">Regenerate</button>
                      </div>
                    </div>
                    <p className="hint">
                      Keep this secret. Regenerating instantly invalidates the previous key.
                    </p>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-hd">
                    <h3>Example request</h3>
                  </div>
                  <div className="panel-bd">
                    <pre className="snippet">
                      <span className="c">// Screen a wallet before completing onboarding</span>
                      <span className="k">const</span> res = <span className="k">await</span> fetch(
                      <span className="s">
                        "https://api.trace.dev/v1/attribute?address=0x3e71..."
                      </span>
                      , {"{"}
                      headers: {"{"} <span className="s">"x-api-key"</span>:{" "}
                      <span className="s">"trace_live_sk_..."</span> {"}"}
                      {"}"});
                      <span className="k">const</span> result = <span className="k">await</span>{" "}
                      res.json();
                      <span className="c">
                        // result.risk, result.nearestVasp, result.confidence
                      </span>
                    </pre>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Usage this month</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="plan-row">
                      <span>API calls</span>
                      <b>8,214 / 25,000</b>
                    </div>
                    <div className="usagebar">
                      <i style={{ width: "33%" }}></i>
                    </div>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Webhooks</h3>
                  </div>
                  <div className="panel-bd">
                    <p
                      style={{
                        fontSize: "12.5px",
                        color: "var(--text-dim)",
                        lineHeight: "1.6",
                        margin: "0 0 14px",
                      }}
                    >
                      Get a real-time POST when a screening comes back high risk, instead of
                      polling.
                    </p>
                    <div className="act">
                      <div>
                        <div className="lbl mono" style={{ fontSize: "12.5px" }}>
                          https://novapay.example/hooks/trace
                        </div>
                        <div className="sub">
                          Fires on:{" "}
                          <span className="tag tag-red" style={{ marginLeft: "4px" }}>
                            high_risk
                          </span>{" "}
                          <span className="tag tag-amb" style={{ marginLeft: "4px" }}>
                            sanctions_match
                          </span>
                        </div>
                      </div>
                      <span className="done">Active</span>
                    </div>
                    <button className="btn btn-line btn-sm" style={{ marginTop: "6px" }}>
                      Add endpoint
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Docs</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="act">
                      <div>
                        <div className="lbl">API reference</div>
                        <div className="sub">Full endpoint &amp; response schema</div>
                      </div>
                      <button className="btn btn-line btn-sm">Open</button>
                    </div>
                    <div className="act">
                      <div>
                        <div className="lbl">Methodology</div>
                        <div className="sub">How risk scores are calculated</div>
                      </div>
                      <button className="btn btn-line btn-sm">Open</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/*================= TEAM & PLAN =================*/}
          <section className="page" id="page-team">
            <div className="page-hd">
              <h1>Team &amp; plan</h1>
              <p>
                Manage who on your team can screen wallets and review alerts, and your org's plan.
              </p>
            </div>

            <div className="cols">
              <div className="panel">
                <div className="panel-hd">
                  <h3>Team members</h3>
                  <span className="meta">3 seats</span>
                </div>
                <div className="panel-bd flush">
                  <div className="member">
                    <div className="avatar">AM</div>
                    <div>
                      <div className="name">A. Mehta</div>
                      <div className="email">a.mehta@novapay.example</div>
                    </div>
                    <span className="role-badge owner">Owner</span>
                  </div>
                  <div className="member">
                    <div className="avatar">RI</div>
                    <div>
                      <div className="name">R. Iyer</div>
                      <div className="email">r.iyer@novapay.example</div>
                    </div>
                    <span className="role-badge">Analyst</span>
                  </div>
                  <div className="member">
                    <div className="avatar">+</div>
                    <div>
                      <div className="name" style={{ color: "var(--text-dim)" }}>
                        Invite a teammate
                      </div>
                      <div className="email">{"\u00a0"}</div>
                    </div>
                    <button className="btn btn-line btn-sm" style={{ marginLeft: "auto" }}>
                      Invite
                    </button>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Current plan</h3>
                  </div>
                  <div className="panel-bd">
                    <div className="act">
                      <div>
                        <div className="lbl">Growth</div>
                        <div className="sub">25,000 API calls / month · 3 seats</div>
                      </div>
                      <span className="done">Active</span>
                    </div>
                    <div className="act">
                      <div>
                        <div className="lbl">Upgrade to Scale</div>
                        <div className="sub">100,000 calls / month · unlimited seats</div>
                      </div>
                      <button className="btn btn-line btn-sm">View plans</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/*================= TRACE AI — floating assistant =================*/}
      <div
        className="ai-fab"
        id="aiFab"
        data-ai-toggle="true"
        role="button"
        aria-label="Open Trace AI"
      >
        <div className="pulse"></div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#06060a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      </div>

      <div className="ai-panel" id="aiPanel">
        <div className="ai-hd">
          <span className="ai-dot"></span>
          <div>
            <b>Trace AI</b>
            <span>Explaining the wallet 0x3e71…8d02 result</span>
          </div>
          <span className="close" data-ai-toggle="true">
            ✕
          </span>
        </div>
        <div className="ai-suggested">
          <span className="ai-chip" data-ai-ask="true">
            Why is this flagged high risk?
          </span>
          <span className="ai-chip" data-ai-ask="true">
            Is this safe to onboard?
          </span>
          <span className="ai-chip" data-ai-ask="true">
            What does mixer-adjacent mean?
          </span>
        </div>
        <div className="ai-body" id="aiBody">
          <div className="ai-msg">
            <div className="ai-avatar">✦</div>
            <div className="ai-bubble">
              Hi, I'm Trace AI. Ask me anything about this screening result — I only explain what
              the engine already found, I don't change the verdict.
            </div>
          </div>
          <div className="ai-msg">
            <div className="ai-avatar">✦</div>
            <div className="ai-bubble">
              This wallet was flagged <b>High risk</b> because the origin address matched an OFAC
              sanctions entry<span className="ai-cite">1</span> and hop 1 shows prior exposure to a
              known mixing service<span className="ai-cite">2</span>. No regulated VASP was reached
              within 2 hops.
            </div>
          </div>
        </div>
        <div className="ai-input-row">
          <input type="text" placeholder="Ask about this trace…" id="aiInput" />
          <div className="ai-send" data-ai-send="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#06060a"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
