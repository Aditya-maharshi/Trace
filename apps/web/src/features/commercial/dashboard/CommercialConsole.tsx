import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { signOutEverywhere, getGuestSession } from "@/features/auth/session";
import { useAttributionStream } from "@/hooks/use-attribution-stream";
import {
  API_BASE,
  API_KEY,
  askFollowUp,
  exportReport,
  getAttribution,
  type AttributionResponse,
} from "@/lib/api";
import { ETH_ADDRESS_RE, truncateAddress } from "@/lib/types";
import { AttributionGraph } from "./components/AttributionGraph";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Sparkles, Check, Database, GitFork, AlertTriangle, Layers, Map } from "lucide-react";
import { BfsProgressFeed } from "./components/BfsProgressFeed";
import "./trace-console.css";

type PageId = "overview" | "screen" | "batch" | "alerts" | "history" | "api" | "team";

interface LookupRow {
  id: string;
  queried_address: string;
  requested_at: string;
  nearest_vasp: string | null;
  confidence: string | null;
  risk: string | null;
  raw_response?: Record<string, unknown> | null;
}

interface BatchJob {
  id: string;
  name: string;
  total: number;
  done: number;
  high: number;
  status: "processing" | "complete" | "error";
  error?: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "T") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
}

function displayName(email: string | null) {
  if (!email) return "Analyst";
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._]/g, " ");
}

function riskPill(risk: string | null) {
  const r = (risk ?? "").toUpperCase();
  if (r === "HIGH") return <span className="risk-pill risk-high">High</span>;
  if (r === "UNKNOWN") return <span className="risk-pill risk-med">Medium</span>;
  return <span className="risk-pill risk-low">Low</span>;
}

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleString();
}

function maskKey(key: string) {
  if (!key) return "Set VITE_API_KEY on the web app";
  if (key.length < 12) return "••••••••";
  return `${key.slice(0, 14)}••••••••••••••••${key.slice(-4)}`;
}

function pathAddresses(data: AttributionResponse): string[] {
  return data.paths?.[0]?.path ?? [];
}

function vaspDisplay(row: LookupRow): string {
  const raw = row.raw_response;
  const label =
    (typeof raw?.['nearestVaspLabel'] === "string" && raw['nearestVaspLabel']) ||
    (typeof raw?.['nearest_vasp_label'] === "string" && raw['nearest_vasp_label']) ||
    null;
  const value = label || row.nearest_vasp;
  if (!value) return "Unhosted";
  if (ETH_ADDRESS_RE.test(value)) return truncateAddress(value);
  return value;
}

const LOOKUP_CACHE_KEY = "trace_console_lookups";

function rowFromAttribution(data: AttributionResponse): LookupRow {
  return {
    id: data.requestId || `local-${data.wallet}`,
    queried_address: data.wallet,
    requested_at: new Date().toISOString(),
    nearest_vasp: data.nearestVaspLabel || data.nearestVasp,
    confidence: data.confidence ?? null,
    risk: data.risk ?? null,
    raw_response: data as unknown as Record<string, unknown>,
  };
}

function mergeLookups(...lists: LookupRow[][]): LookupRow[] {
  const seen = new Set<string>();
  const out: LookupRow[] = [];
  for (const list of lists) {
    for (const row of list) {
      const key = row.id || `${row.queried_address}-${row.requested_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out.slice(0, 100);
}

function readCachedLookups(): LookupRow[] {
  try {
    const raw = localStorage.getItem(LOOKUP_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LookupRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((cols) =>
      cols
        .map((c) => {
          const v = String(c ?? "");
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CommercialConsole({
  userEmail,
  isDemoMode,
  initialPage,
}: {
  userEmail: string | null;
  isDemoMode: boolean;
  initialPage?: PageId;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState<PageId>(initialPage ?? "overview");
  const [lookups, setLookups] = useState<LookupRow[]>([]);
  const [address, setAddress] = useState("");
  const [pathView, setPathView] = useState<"graph" | "list">("graph");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Hi, I'm Trace AI. Screen a wallet first, then ask me about the result — I only explain what the engine already found.",
    },
  ]);
  const [batches, setBatches] = useState<BatchJob[]>([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyRisk, setHistoryRisk] = useState("all");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, narrative, loading, error, progressLog, lookup } = useAttributionStream();

  const who = displayName(userEmail);
  const role = getGuestSession().isGuest ? "Demo access" : "Compliance Officer";

  useEffect(() => {
    if (initialPage) setPage(initialPage);
  }, [initialPage]);

  useEffect(() => {
    async function fetchLookups() {
      const cached = readCachedLookups();
      const live = data ? [rowFromAttribution(data)] : [];
      let remote: LookupRow[] = [];
      try {
        const { data: rows, error: err } = await supabase
          .from("lookups")
          .select("id, queried_address, requested_at, nearest_vasp, confidence, risk, raw_response")
          .order("requested_at", { ascending: false })
          .limit(100);
        if (!err) remote = (rows as LookupRow[]) ?? [];
      } catch {
        /* guest / unreachable supabase — use cache + live result */
      }
      const merged = mergeLookups(live, remote, cached);
      setLookups(merged);
      try {
        localStorage.setItem(LOOKUP_CACHE_KEY, JSON.stringify(merged));
      } catch {
        /* ignore quota */
      }
    }
    fetchLookups();
  }, [data]);

  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return lookups.filter((l) => new Date(l.requested_at) >= start).length;
  }, [lookups]);

  const monthCount = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return lookups.filter((l) => new Date(l.requested_at) >= start).length;
  }, [lookups]);

  const alerts = useMemo(
    () => lookups.filter((l) => (l.risk ?? "").toUpperCase() === "HIGH" || (l.risk ?? "").toUpperCase() === "UNKNOWN"),
    [lookups],
  );

  const filteredHistory = useMemo(() => {
    return lookups.filter((l) => {
      if (historyFilter && !l.queried_address.toLowerCase().includes(historyFilter.toLowerCase())) return false;
      if (historyRisk === "high") return (l.risk ?? "").toUpperCase() === "HIGH";
      if (historyRisk === "medium") return (l.risk ?? "").toUpperCase() === "UNKNOWN";
      if (historyRisk === "low") return (l.risk ?? "").toUpperCase() === "LOW";
      return true;
    });
  }, [lookups, historyFilter, historyRisk]);

  function runScreen(e?: React.FormEvent) {
    e?.preventDefault();
    const cleanAddr = address.trim();
    if (!ETH_ADDRESS_RE.test(cleanAddr)) return;
    setPage("screen");
    lookup(cleanAddr);
  }

  async function onExport(format: "pdf" | "csv") {
    if (!data) return;
    await exportReport(data, format);
  }

  async function sendAi(question: string) {
    const q = question.trim();
    if (!q || aiBusy) return;
    setAiMsgs((m) => [...m, { role: "user", text: q }]);
    setAiInput("");
    setAiBusy(true);
    try {
      if (!data) {
        setAiMsgs((m) => [
          ...m,
          { role: "assistant", text: "Screen a wallet first — I can only explain a live attribution result." },
        ]);
        return;
      }
      const res = await askFollowUp(q, data);
      setAiMsgs((m) => [...m, { role: "assistant", text: res.answer || "No answer returned." }]);
    } catch (err) {
      setAiMsgs((m) => [
        ...m,
        { role: "assistant", text: err instanceof Error ? err.message : "Trace AI could not answer that." },
      ]);
    } finally {
      setAiBusy(false);
    }
  }

  async function runBatch(file: File) {
    const text = await file.text();
    const addrs = text
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => ETH_ADDRESS_RE.test(s))
      .slice(0, 25);
    if (addrs.length === 0) {
      setBatches((b) => [{ id: `${file.name}-empty-${Date.now()}`, name: file.name, total: 0, done: 0, high: 0, status: "error", error: "No valid Ethereum addresses found." }, ...b]);
      return;
    }
    const jobId = `${file.name}-${Date.now()}`;
    setBatches((b) => [{ id: jobId, name: file.name, total: addrs.length, done: 0, high: 0, status: "processing" }, ...b]);
    let done = 0;
    let high = 0;
    for (const addr of addrs) {
      try {
        const result = await getAttribution(addr);
        if (result.risk === "HIGH") high += 1;
      } catch {
        /* continue remaining rows */
      }
      done += 1;
      setBatches((list) =>
        list.map((j) =>
          j.id === jobId
            ? { ...j, done, high, status: done === addrs.length ? "complete" : "processing" }
            : j,
        ),
      );
    }
  }

  const hops = data ? pathAddresses(data) : [];
  const sanctioned = data?.sanctionsDetail?.some((s) => s.sanctioned) ?? false;
  const mixer = (data?.mixerExposure?.length ?? 0) > 0;
  const vaspLabel = data?.nearestVaspLabel || data?.nearestVasp;
  const apiExample = `${API_BASE || (typeof window !== "undefined" ? window.location.origin : "")}/api/v1/attribute?address=0x…`;

  return (
    <div className="trace-console">
      <div className="ambient"><div className="orb-a" /><div className="orb-b" /></div>
      <div className="advisory">
        Prototype · <b>SIH 2026 PS 26182</b> · {isDemoMode ? "Demo mode — fixture cache" : "Live attribution"} · commercial/VASP console
      </div>

      <div className="topbar">
        <Link className="brand" to="/">
          <span className="dot" />
          <b>Trace</b>
          <span>Compliance Console</span>
        </Link>
        <div className="tb-right">
          <span className="orgtag">{userEmail ? userEmail.split("@")[1] ?? "Workspace" : "Guest workspace"}</span>
          <div className="who">
            <b>{who}</b>
            <span>{role}</span>
          </div>
          <button
            className="btn btn-line btn-sm"
            onClick={async () => {
              await signOutEverywhere();
              navigate({ to: "/commercial/login", search: { switch: "true" } as never });
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="shell">
        <aside>
          <h6>Screening</h6>
          <button className={`nav-item${page === "overview" ? " on" : ""}`} onClick={() => setPage("overview")}>Overview</button>
          <button className={`nav-item${page === "screen" ? " on" : ""}`} onClick={() => setPage("screen")}>Screen a wallet</button>
          <button className={`nav-item${page === "batch" ? " on" : ""}`} onClick={() => setPage("batch")}>Batch screening</button>
          <button className={`nav-item${page === "alerts" ? " on" : ""}`} onClick={() => setPage("alerts")}>
            Risk alerts {alerts.length > 0 && <span className="ct alert">{alerts.length}</span>}
          </button>
          <button className={`nav-item${page === "history" ? " on" : ""}`} onClick={() => setPage("history")}>
            Screening history <span className="ct">{lookups.length}</span>
          </button>
          <h6>Developer</h6>
          <button className={`nav-item${page === "api" ? " on" : ""}`} onClick={() => setPage("api")}>API &amp; integration</button>
          <h6>Organization</h6>
          <button className={`nav-item${page === "team" ? " on" : ""}`} onClick={() => setPage("team")}>Team &amp; plan</button>
        </aside>

        <main className="console-main">
          {page === "overview" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Overview</h1>
                <p>Snapshot of your org&apos;s screening activity from the live lookup log. Screening only — no case management.</p>
              </div>
              <div className="stats">
                <div className="stat">
                  <div className="lbl">Screened today</div>
                  <div className="val">{todayCount}</div>
                  <div className="delta">From your lookup history</div>
                </div>
                <div className="stat">
                  <div className="lbl">Open risk alerts</div>
                  <div className="val" style={{ color: alerts.length ? "var(--red)" : undefined }}>{alerts.length}</div>
                  <div className="delta warn">High / unclassified results</div>
                </div>
                <div className="stat">
                  <div className="lbl">Lookups this month</div>
                  <div className="val">{monthCount}</div>
                  <div className="delta">of 25,000 included</div>
                </div>
                <div className="stat">
                  <div className="lbl">Latest status</div>
                  <div className="val" style={{ fontSize: 18 }}>{loading ? "Tracing…" : data ? "Ready" : "Idle"}</div>
                  <div className="delta up">{isDemoMode ? "Demo cache" : "Engine online"}</div>
                </div>
              </div>
              <div className="cols" style={{ marginTop: 16 }}>
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Recent screenings</h3>
                    <span className="meta">Lookup log</span>
                  </div>
                  <div className="panel-bd flush">
                    {lookups.length === 0 ? (
                      <p className="empty">No screenings yet. Run a wallet screen to populate this table.</p>
                    ) : (
                      <div className="tbl-wrap">
                        <table className="tbl">
                          <thead><tr><th>Wallet</th><th>Risk</th><th>Matched VASP</th><th>Time</th></tr></thead>
                          <tbody>
                            {lookups.slice(0, 6).map((row) => (
                              <tr key={row.id}>
                                <td className="mono">{truncateAddress(row.queried_address)}</td>
                                <td>{riskPill(row.risk)}</td>
                                <td>{vaspDisplay(row)}</td>
                                <td className="mono">{relativeTime(row.requested_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                <div className="stack">
                  <div className="panel">
                    <div className="panel-hd"><h3>Quick action</h3></div>
                    <div className="panel-bd">
                      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 14px" }}>
                        Screen a new wallet before onboarding or clearing a transaction.
                      </p>
                      <button className="btn" style={{ width: "100%" }} onClick={() => setPage("screen")}>Screen a wallet</button>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-hd"><h3>Plan usage</h3></div>
                    <div className="panel-bd">
                      <div className="plan-row"><span>Lookups</span><b>{monthCount} / 25,000</b></div>
                      <div className="usagebar"><i style={{ width: `${Math.min(100, (monthCount / 25000) * 100)}%` }} /></div>
                      <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "12px 0 0" }}>
                        Counted from stored screening history
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "screen" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Screen a wallet</h1>
                <p>Run attribution and risk screening on a single wallet before onboarding or clearing a transaction. This is a screening-only view — nothing here opens a government case.</p>
              </div>
              <form className="searchrow" onSubmit={runScreen}>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x… Ethereum address"
                  aria-label="Wallet address"
                  disabled={loading}
                />
                <select aria-label="Chain" defaultValue="eth" disabled>
                  <option value="eth">Ethereum</option>
                </select>
                <button className="btn" type="submit" disabled={loading || !ETH_ADDRESS_RE.test(address.trim())}>
                  {loading ? "Tracing…" : "Run screening"}
                </button>
              </form>
              <p className="hint">Live BFS attribution against the Trace API. Ethereum only in this prototype.</p>
              {error && <p className="err">{error}</p>}
              {loading && !data && (
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <Skeleton className="h-[120px] w-full" />
                  <Skeleton className="h-[250px] w-full" />
                  <BfsProgressFeed messages={progressLog} />
                </div>
              )}
              {data && (
                <>
                  <div className={`verdict${data.risk === "HIGH" ? " risk" : data.risk === "UNKNOWN" ? " warn" : ""}`}>
                    <div>
                      <h2>
                        {data.risk === "HIGH"
                          ? sanctioned
                            ? "High risk — sanctions-list match"
                            : "High risk"
                          : vaspLabel
                            ? `Attributed to ${vaspLabel}`
                            : "No VASP reached"}
                      </h2>
                      <p>
                        Address <span className="addr">{truncateAddress(data.wallet)}</span>
                        {narrative ? ` — ${narrative}` : vaspLabel ? ` resolved to ${vaspLabel} in ${data.hops ?? hops.length} hops.` : " — no regulated VASP found at current hop depth."}
                      </p>
                    </div>
                    <div className="vscore">
                      <b>{data.risk === "HIGH" ? "High" : data.risk === "UNKNOWN" ? "Medium" : "Low"}</b>
                      <span>Score · {data.score ?? "—"} · {data.confidence ?? "n/a"} confidence</span>
                    </div>
                  </div>
                  <div className="cols">
                    <div className="stack">
                      <div className={`panel view-swap${pathView === "list" ? " list" : ""}`}>
                        <div className="panel-hd">
                          <h3>Traced path</h3>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span className="meta">{data.hops ?? hops.length} hops · {data.incompleteTraversal?.skippedNodes ?? 0} skipped</span>
                            <div className="graph-toggle">
                              <button className={pathView === "graph" ? "on" : ""} type="button" onClick={() => setPathView("graph")}>Graph</button>
                              <button className={pathView === "list" ? "on" : ""} type="button" onClick={() => setPathView("list")}>List</button>
                            </div>
                          </div>
                        </div>
                        <div className="panel-bd graph-view">
                          <div className="graph-host">
                            <AttributionGraph graph={data.graph} target={data.wallet} />
                          </div>
                        </div>
                        <div className="panel-bd tight list-view">
                          {hops.length === 0 ? (
                            <p className="empty">No path returned.</p>
                          ) : hops.map((hop, i) => {
                            const isFirst = i === 0;
                            const isLast = i === hops.length - 1;
                            const mix = data.mixerExposure?.some((m) => m.address.toLowerCase() === hop.toLowerCase());
                            const san = data.sanctionsDetail?.some((s) => s.address.toLowerCase() === hop.toLowerCase() && s.sanctioned);
                            return (
                              <div className="hop" key={`${hop}-${i}`}>
                                <div className={`dot${san ? " start" : mix ? " warn" : isLast ? " end" : ""}`}>
                                  {san ? "!" : isLast ? "✓" : i}
                                </div>
                                <div>
                                  <div className="addr">{truncateAddress(hop)}</div>
                                  <div className="meta">
                                    {isFirst ? "Wallet under review" : isLast ? (vaspLabel ?? "Terminal node") : `Hop ${i}`}
                                    {san && <span className="tag tag-red">Sanctioned</span>}
                                    {mix && <span className="tag tag-amb">Mixer-adjacent</span>}
                                    {isLast && vaspLabel && <span className="tag tag-grn">VASP</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="integrity">
                          <span>Source <b>{data.dataProvenance?.source ?? data.dataSource}</b></span>
                          <span>Traversal <b>{data.incompleteTraversal?.timeoutReached ? "partial" : "complete"}</b></span>
                        </div>
                      </div>
                      <div className="panel">
                        <div className="panel-hd"><h3>Findings</h3></div>
                        <div className="panel-bd">
                          {sanctioned && (
                            <div className="flag">
                              <span className="ic ic-red">✕</span>
                              <div>
                                <div className="hd">Sanctions-list match</div>
                                <div className="sub">{data.methodology?.sanctionsSource ?? "Screened against configured sanctions lists"}</div>
                              </div>
                            </div>
                          )}
                          {mixer && (
                            <div className="flag">
                              <span className="ic ic-amb">▲</span>
                              <div>
                                <div className="hd">Mixer-adjacent hop detected</div>
                                <div className="sub">{data.mixerExposure.map((m) => m.label || truncateAddress(m.address)).join(", ")}</div>
                              </div>
                            </div>
                          )}
                          {data.structuringSignalDetected && (
                            <div className="flag">
                              <span className="ic ic-amb">▲</span>
                              <div>
                                <div className="hd">Structuring pattern flagged</div>
                                <div className="sub">Value splitting across hops matched the structuring heuristic.</div>
                              </div>
                            </div>
                          )}
                          {!vaspLabel && (
                            <div className="flag">
                              <span className="ic ic-blu">i</span>
                              <div>
                                <div className="hd">No VASP attribution at current hop depth</div>
                                <div className="sub">Increase max hops or continue from a downstream address.</div>
                              </div>
                            </div>
                          )}
                          {!sanctioned && !mixer && vaspLabel && (
                            <div className="flag">
                              <span className="ic ic-grn">✓</span>
                              <div>
                                <div className="hd">Resolved to a known VASP</div>
                                <div className="sub">{vaspLabel} · {data.confidence} confidence</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="stack">
                      <div className="panel">
                        <div className="panel-hd"><h3>Recommended action</h3></div>
                        <div className="panel-bd">
                          <div className="act">
                            <div>
                              <div className="lbl">Export screening report</div>
                              <div className="sub">PDF generated from the stored server-side result</div>
                            </div>
                            <button className="btn btn-sm" type="button" onClick={() => onExport("pdf")}>Export</button>
                          </div>
                          <div className="act">
                            <div>
                              <div className="lbl">Export CSV</div>
                              <div className="sub">Tabular dump for your internal audit file</div>
                            </div>
                            <button className="btn btn-line btn-sm" type="button" onClick={() => onExport("csv")}>CSV</button>
                          </div>
                          <div className="act">
                            <div>
                              <div className="lbl">Ask Trace AI</div>
                              <div className="sub">Explain this verdict from engine findings only</div>
                            </div>
                            <button className="btn btn-line btn-sm" type="button" onClick={() => setAiOpen(true)}>Open</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {page === "batch" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Batch screening</h1>
                <p>Upload a CSV of Ethereum addresses. This prototype screens up to 25 rows sequentially against the live API.</p>
              </div>
              <div className="panel">
                <div className="panel-bd">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void runBatch(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="dropzone" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void runBatch(f);
                  }}>
                    <div className="ico">⇧</div>
                    <div className="ttl">Drop a CSV file, or click to browse</div>
                    <div className="sub">One address per row · up to 25 rows in this prototype · .csv only</div>
                  </div>
                  <p className="hint">
                    Need a template?{" "}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() =>
                        downloadCsv("trace_batch_template.csv", [
                          ["address"],
                          ["0x0000000000000000000000000000000000000000"],
                        ])
                      }
                    >
                      Download sample CSV
                    </button>
                  </p>
                </div>
              </div>
              <div className="panel" style={{ marginTop: 16 }}>
                <div className="panel-hd">
                  <h3>Recent batches</h3>
                  <span className="meta">{batches.filter((b) => b.status === "processing").length} in progress</span>
                </div>
                <div className="panel-bd flush">
                  {batches.length === 0 && <p className="empty">No batches yet.</p>}
                  {batches.map((b) => (
                    <div className="batch-row" key={b.id}>
                      <div>
                        <div className="lbl" style={{ fontSize: 13.5 }}>{b.name}</div>
                        <div className="sub" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                          {b.error ?? `${b.done} of ${b.total} screened · ${b.high} high risk`}
                        </div>
                      </div>
                      <div className="progress"><i style={{ width: `${b.total ? (b.done / b.total) * 100 : 0}%` }} /></div>
                      <span className={`done${b.status === "processing" ? " pending" : ""}`}>{b.status === "complete" ? "Complete" : b.status === "error" ? "Error" : "Processing"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page === "alerts" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Risk alerts</h1>
                <p>High and unclassified screenings from your lookup history that still need a compliance look.</p>
              </div>
              <div className="panel">
                <div className="panel-hd">
                  <h3>Open alerts</h3>
                  <span className="meta">{alerts.length} flagged</span>
                </div>
                <div className="panel-bd flush">
                  {alerts.length === 0 && <p className="empty">No high-risk or unclassified results in history.</p>}
                  {alerts.map((row) => (
                    <div className="alert-row" key={row.id}>
                      <span className={`ic ${(row.risk ?? "").toUpperCase() === "HIGH" ? "ic-red" : "ic-amb"}`}>
                        {(row.risk ?? "").toUpperCase() === "HIGH" ? "✕" : "▲"}
                      </span>
                      <div>
                        <div className="addr">{truncateAddress(row.queried_address)}</div>
                        <div className="sub">{row.risk} · {relativeTime(row.requested_at)}</div>
                      </div>
                      <div className="alert-actions">
                        <button
                          className="btn btn-line btn-sm"
                          type="button"
                          onClick={() => {
                            setAddress(row.queried_address);
                            setPage("screen");
                            lookup(row.queried_address);
                          }}
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page === "history" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Screening history</h1>
                <p>Full log of every screening stored for this account, for internal audit.</p>
              </div>
              <div className="searchrow" style={{ marginBottom: 16 }}>
                <input placeholder="Filter by wallet address" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} aria-label="Filter" />
                <select aria-label="Risk filter" value={historyRisk} onChange={(e) => setHistoryRisk(e.target.value)}>
                  <option value="all">All risk levels</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  className="btn btn-line"
                  type="button"
                  onClick={() =>
                    downloadCsv("trace_screening_history.csv", [
                      ["Wallet", "Risk", "Matched VASP", "Confidence", "Date"],
                      ...filteredHistory.map((row) => [
                        row.queried_address,
                        row.risk ?? "",
                        vaspDisplay(row),
                        row.confidence ?? "",
                        new Date(row.requested_at).toISOString(),
                      ]),
                    ])
                  }
                >
                  Export CSV
                </button>
              </div>
              <div className="panel">
                <div className="panel-bd flush">
                  {filteredHistory.length === 0 ? (
                    <p className="empty">No matching lookups.</p>
                  ) : (
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr><th>Wallet</th><th>Risk</th><th>Matched VASP</th><th>Analyst</th><th>Date</th></tr></thead>
                        <tbody>
                          {filteredHistory.map((row) => (
                            <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => { setAddress(row.queried_address); setPage("screen"); lookup(row.queried_address); }}>
                              <td className="mono">{truncateAddress(row.queried_address)}</td>
                              <td>{riskPill(row.risk)}</td>
                              <td>{vaspDisplay(row)}</td>
                              <td>{who}</td>
                              <td className="mono">{new Date(row.requested_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {page === "api" && (
            <section className="page on">
              <div className="page-hd">
                <h1>API &amp; integration</h1>
                <p>Plug wallet screening directly into your own onboarding flow using the Trace v1 API.</p>
              </div>
              <div className="cols">
                <div className="stack">
                  <div className="panel">
                    <div className="panel-hd"><h3>Your API key</h3></div>
                    <div className="panel-bd">
                      <div className="key-box">
                        <code>{maskKey(API_KEY)}</code>
                        <button
                          className="btn btn-line btn-sm"
                          type="button"
                          onClick={async () => {
                            if (!API_KEY) return;
                            await navigator.clipboard.writeText(API_KEY);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="hint">This is the key the web app uses (`VITE_API_KEY`). Keep it secret.</p>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-hd"><h3>Example request</h3></div>
                    <div className="panel-bd">
                      <pre className="snippet">
                        <span className="c">{"// Screen a wallet before completing onboarding"}</span>{"\n"}
                        <span className="k">const</span>{" res = "}<span className="k">await</span>{" fetch("}<span className="s">{JSON.stringify(apiExample)}</span>{", {\n  headers: { "}<span className="s">&quot;x-api-key&quot;</span>{": "}<span className="s">&quot;your-key&quot;</span>{" }\n});\n"}
                        <span className="k">const</span>{" result = "}<span className="k">await</span>{" res.json();\n"}
                        <span className="c">{"// result.risk, result.nearestVasp, result.confidence"}</span>
                      </pre>
                    </div>
                  </div>
                </div>
                <div className="stack">
                  <div className="panel">
                    <div className="panel-hd"><h3>Usage this month</h3></div>
                    <div className="panel-bd">
                      <div className="plan-row"><span>Lookups</span><b>{monthCount} / 25,000</b></div>
                      <div className="usagebar"><i style={{ width: `${Math.min(100, (monthCount / 25000) * 100)}%` }} /></div>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-hd"><h3>Docs</h3></div>
                    <div className="panel-bd">
                      <div className="act">
                        <div>
                          <div className="lbl">API reference</div>
                          <div className="sub">OpenAPI for /api/v1</div>
                        </div>
                        <a className="btn btn-line btn-sm" href={`${API_BASE}/api/docs`} target="_blank" rel="noreferrer">Open</a>
                      </div>
                      <div className="act">
                        <div>
                          <div className="lbl">Methodology</div>
                          <div className="sub">How risk scores are calculated</div>
                        </div>
                        <Link className="btn btn-line btn-sm" to="/methodology">Open</Link>
                      </div>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-hd"><h3>Webhooks</h3></div>
                    <div className="panel-bd">
                      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 8px" }}>
                        Live webhook delivery is not enabled in this prototype. Poll <span className="mono">/api/v1/attribute</span> or watch screening history instead.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "team" && (
            <section className="page on">
              <div className="page-hd">
                <h1>Team &amp; plan</h1>
                <p>Signed-in identity for this workspace. Seat management is prototype UI only.</p>
              </div>
              <div className="cols">
                <div className="panel">
                  <div className="panel-hd">
                    <h3>Team members</h3>
                    <span className="meta">1 seat</span>
                  </div>
                  <div className="panel-bd flush">
                    <div className="member">
                      <div className="avatar">{initials(who)}</div>
                      <div>
                        <div className="name">{who}</div>
                        <div className="email">{userEmail ?? "guest session"}</div>
                      </div>
                      <span className="role-badge owner">Owner</span>
                    </div>
                  </div>
                </div>
                <div className="stack">
                  <div className="panel">
                    <div className="panel-hd"><h3>Current plan</h3></div>
                    <div className="panel-bd">
                      <div className="act">
                        <div>
                          <div className="lbl">Prototype</div>
                          <div className="sub">Usage counted from stored lookups</div>
                        </div>
                        <span className="done">Active</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      <button className="ai-fab" type="button" onClick={() => setAiOpen((v) => !v)} aria-label="Open Trace AI">
        <svg viewBox="0 0 24 24" fill="none" stroke="#06060a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      </button>
      <div className={`ai-panel${aiOpen ? " open" : ""}`}>
        <div className="ai-hd">
          <span className="ai-dot" />
          <div>
            <b>Trace AI</b>
            <span>{data ? `Explaining ${truncateAddress(data.wallet)}` : "No active screening"}</span>
          </div>
          <button className="close" type="button" onClick={() => setAiOpen(false)} aria-label="Close Trace AI">✕</button>
        </div>
        <div className="ai-suggested">
          {["Why is this confidence level assigned?", "Are there mixer or sanctions signals?", "Which hop is most suspicious?"].map((q) => (
            <button className="ai-chip" type="button" key={q} onClick={() => sendAi(q)}>{q}</button>
          ))}
        </div>
        <div className="ai-body">
          {aiMsgs.map((m, i) => (
            <div className={`ai-msg${m.role === "user" ? " user" : ""}`} key={i}>
              <div className="ai-avatar">{m.role === "user" ? initials(who) : "✦"}</div>
              <div className="ai-bubble">{m.text}</div>
            </div>
          ))}
          {aiBusy && <div className="ai-msg"><div className="ai-avatar">✦</div><div className="ai-bubble">Thinking…</div></div>}
        </div>
        <div className="ai-input-row">
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Ask about this trace…"
            onKeyDown={(e) => { if (e.key === "Enter") void sendAi(aiInput); }}
          />
          <button className="ai-send" type="button" onClick={() => void sendAi(aiInput)} aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06060a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

