import React, { useState } from 'react';
import './government-landing.css';
import { LandingScene } from '@/features/commercial/landing/LandingScene';
import { useCryptoPrices } from '@/features/commercial/hooks/use-crypto-prices';
import { Link } from '@tanstack/react-router';

export function GovernmentLandingPage() {
  const { prices } = useCryptoPrices();
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // We need to inject the LandingScene into the hero section
  return (
    <div className="gov-landing-root">
      <header>
  <div className="advisory">
    Prototype built for <b>Smart India Hackathon 2026</b> · Problem Statement 26182 · Not an operational Government of India system
  </div>
  <nav>
    <div className="logo">Trace<span className="sub">Automated VASP Attribution &amp; Blockchain Intelligence</span></div>
    <div className="nav-links">
      <a href="#how">How it works</a>
      <a href="#statutory">Statutory output</a>
      <a href="#sovereignty">Data sovereignty</a>
      <a href="/dashboard">Console</a>
    </div>
    <a href="#brief" className="nav-cta">Request a briefing</a>
  </nav>
</header>

<section className="hero">
  <div className="hero-scene-container"><LandingScene prices={prices} /></div>
  <div className="hero-vignette"></div>
  <div className="hero-hint"><span className="ring"></span>drag to orbit · click node</div>
  <div id="coin-info">
    <div className="ci-header">
      <span className="ci-name" id="ci-name">Bitcoin</span>
      <span className="ci-sym" id="ci-sym">BTC</span>
    </div>
    <div className="ci-price" id="ci-price">$77,144.60</div>
    <div className="ci-change down" id="ci-change">▼ 1.27%</div>
  </div>

  <div className="wrap hero-grid">
    <div className="hero-content">
      <span className="eyebrow-tag"><span className="dot"></span>SIH26182 · Blockchain Intelligence APIs</span>
      <h1>From an unknown wallet to a served freeze notice.</h1>
      <p className="lede">An investigating officer enters one suspect address. Trace maps the multi-hop flow, identifies the nearest regulated VASP, and returns a dossier that is ready to file.</p>
      <p className="sub">Attribution alone stalls an investigation. Trace produces the artefacts that move it forward — a Section 63 certificate for the court record, a Section 94 summons for KYC production, and a SAHYOG payload for the freeze request.</p>
      <div className="hero-actions">
        <a href="#brief" className="btn-primary">Request a briefing</a>
        <a href="#how" className="btn-ghost">See the pipeline</a>
      </div>
      <p className="hero-note">For agency use. Access is provisioned per unit — there is no public sign-up.</p>
    </div>

    <aside className="docket" role="img" aria-label="Sample attribution docket tracing a wallet through three hops to a registered exchange">
      <div className="docket-hd">
        <span className="no">DOCKET TRC-2026-004871</span>
        <span className="st">● Attribution complete — 3 hops</span>
      </div>
      <div className="chain">
        <div className="hop">
          <div className="dot start">!</div>
          <div>
            <div className="addr">0x7a2f…c41d</div>
            <div className="meta">Suspect wallet from NCRP complaint #33291<span className="tag tag-red">Reported</span></div>
          </div>
        </div>
        <div className="hop">
          <div className="dot">1</div>
          <div>
            <div className="addr">0x1c88…9ba2</div>
            <div className="meta">Pass-through · ₹41.2L equivalent · 6 min later</div>
          </div>
        </div>
        <div className="hop">
          <div className="dot mix">2</div>
          <div>
            <div className="addr">0xd90f…77e5</div>
            <div className="meta">Structuring detected — split across 4 outputs<span className="tag tag-amb">Layering</span></div>
          </div>
        </div>
        <div className="hop">
          <div className="dot end">✓</div>
          <div>
            <div className="addr">0x3f5c…f0be</div>
            <div className="meta">Exchange deposit address<span className="tag tag-grn">FIU-IND registered</span></div>
          </div>
        </div>
      </div>
      <div className="docket-ft">
        <span>Taint retained <b>68.4%</b></span>
        <span>Confidence <b>High</b></span>
        <span>Dossier SHA-256 <b>a3f9…20c7</b></span>
      </div>
    </aside>
  </div>

  <div className="hero-ticker">
    <div className="ticker-pill">
      <span className="pulse-dot"></span>
      <span className="ticker-label">Live run</span>
    </div>
    <div className="t-item"><span className="sym">TRAVERSAL</span><span className="val">3 hops</span></div>
    <div className="t-divider"></div>
    <div className="t-item"><span className="sym">TAINT</span><span className="val">68.4%</span></div>
    <div className="t-divider"></div>
    <div className="t-item"><span className="sym">ELAPSED</span><span className="val">41s</span></div>
  </div>
</section>

<div className="strip">
  <div className="wrap">
    <div className="strip-grid">
      <div className="cell">
        <div className="n">₹22,845 cr</div>
        <div className="l">Lost to financial cyber fraud in 2024</div>
        <div className="src">NCRP, 36.4 lakh cases</div>
      </div>
      <div className="cell">
        <div className="n">35</div>
        <div className="l">VASPs already integrated with the SAHYOG portal</div>
        <div className="src">Alongside 8 central and 28 state agencies</div>
      </div>
      <div className="cell">
        <div className="n">Hours</div>
        <div className="l">Typical manual traversal time per suspect wallet</div>
        <div className="src">Block-explorer tracing, hop by hop</div>
      </div>
      <div className="cell">
        <div className="n">Under 60s</div>
        <div className="l">Trace attribution run on the same wallet</div>
        <div className="src">Measured on our prototype, 5-hop bound</div>
      </div>
    </div>
  </div>
</div>

<section className="pipeline" id="how">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">how it works</p>
      <h2>The pipeline an investigating officer never has to run by hand</h2>
      <p>Each stage is deterministic and logged. The reasoning is reproducible on demand, because a result that cannot be explained in court is not usable.</p>
    </div>
    <div className="pipe-steps">
      <div className="pipe-step">
        <span className="num mono">STAGE 01</span>
        <h3>Ingest</h3>
        <p>Bitcoin UTXO and account-based chains normalised into one directed multigraph.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 02</span>
        <h3>Cluster</h3>
        <p>Union-Find entity resolution, with CoinJoin and collaborative spends severed first to prevent false merges.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 03</span>
        <h3>Trace</h3>
        <p>Bounded breadth-first traversal with proportional taint carried along every path.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 04</span>
        <h3>Attribute</h3>
        <p>Terminal cluster matched against the VASP registry and classified by FIU-IND status.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 05</span>
        <h3>File</h3>
        <p>Statutory dossier generated, hashed, and pushed to SAHYOG for service.</p>
      </div>
    </div>
  </div>
</section>

<section className="statutory" id="statutory">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">statutory output</p>
      <h2>Output that is admissible, not just informative</h2>
      <p>A graph on a screen cannot be entered into evidence. Every Trace result compiles into the instruments Indian criminal procedure actually recognises.</p>
    </div>
    <div className="track-grid">
      <div className="track-card">
        <span className="tag-act">Bharatiya Sakshya Adhiniyam, 2023</span>
        <h3>Section 63 certificate</h3>
        <p>Two-part statutory certificate generated with the dossier — Part A device and output particulars for the investigating officer, Part B extraction audit trail for expert sign-off, with the SHA-256 hash of the record embedded.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,24 30,24 40,10 55,26 70,8 90,8 100,18 130,18 145,4 165,20 190,20 205,6 225,14 260,14 275,22 300,10" fill="none" stroke="#f7931a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">Bharatiya Nagarik Suraksha Sanhita, 2023</span>
        <h3>Section 94 summons</h3>
        <p>Production order pre-filled with the attributed VASP's corporate particulars and the target address, ready for signature.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,26 25,26 35,14 55,22 75,10 100,10 115,18 135,4 155,12 300,4" fill="none" stroke="#8c9dfc" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">Information Technology Act, 2000</span>
        <h3>SAHYOG freeze request</h3>
        <p>Section 79(3)(b) payload pushed to the portal over its API, routed to the correct VASP with the attribution evidence attached.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,20 40,20 50,30 60,20 80,20 90,4 100,20 130,20 145,28 165,20 300,12" fill="none" stroke="#2fe3a3" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">FATF Recommendation 16</span>
        <h3>IVMS101 Travel Rule payload</h3>
        <p>Originator, beneficiary, and VASP fields mapped to the international schema so offshore requests arrive in a format the receiving compliance system already parses.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,10 30,10 42,28 58,4 72,20 95,20 105,14 300,20" fill="none" stroke="#ff5c7a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
    </div>
  </div>
</section>

<section className="registry">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">registry status</p>
      <h2>Where the FIU-IND registry check changes the next step</h2>
      <p>Attribution answers <em>which</em> entity holds the funds. Registry status answers <em>what instrument you can serve</em> — and the two are useless apart.</p>
    </div>
    <div className="table-shell">
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Terminal VASP status</th><th>What Trace flags</th><th>Instrument available</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Onshore, FIU-IND registered</td>
              <td className="route-open">Direct SAHYOG route open</td>
              <td>Section 79(3)(b) notice served through the portal; expect expeditious compliance</td>
            </tr>
            <tr>
              <td>Offshore, FIU-IND registered</td>
              <td className="route-open">Registered reporting entity</td>
              <td>Domestic obligations apply under PMLA; SAHYOG route open</td>
            </tr>
            <tr>
              <td>Offshore, non-compliant</td>
              <td className="route-block">Flagged as outside the reporting perimeter</td>
              <td>MLAT request; IVMS101 payload prepared for the foreign counterpart</td>
            </tr>
            <tr>
              <td>Bridge or mixer exit</td>
              <td className="route-block">Marked inconclusive, never scored as clean</td>
              <td>Cross-chain continuation queued; no notice issued on an unresolved trail</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<section className="sovereignty" id="sovereignty">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">data sovereignty</p>
      <h2>Built in India, for Indian process</h2>
      <p>Foreign analytics vendors solve the graph problem well. They do not solve the jurisdiction problem, and investigation data leaving the country is its own risk.</p>
    </div>
    <div className="sov-grid">
      <div className="sov-card">
        <h3>Data stays in India</h3>
        <p>Investigation records, case dockets, and audit logs remain on Indian infrastructure. Deployment inside an agency's own environment is on our roadmap.</p>
      </div>
      <div className="sov-card">
        <h3>Indian statutory formats</h3>
        <p>Section 63, Section 94, and SAHYOG payloads are first-class outputs, not exports an officer reformats by hand into a local template.</p>
      </div>
      <div className="sov-card">
        <h3>Reachable by smaller units</h3>
        <p>State cyber cells and district units get the same tooling as central agencies, without an enterprise procurement cycle.</p>
      </div>
    </div>
  </div>
</section>

<section className="cta-section" id="brief">
  <div className="wrap">
    <div className="cta-box">
      <div>
        <h2>Request a briefing for your unit</h2>
        <p>We walk through a live attribution on a wallet of your choosing, show the statutory dossier it produces, and answer what the system does not yet do.</p>
        <p>Access is provisioned per agency with its own isolated case records. Nothing is shared across units.</p>
        <div className="cta-platforms">
          <span className="platform-pill">Multi-hop BFS</span>
          <span className="platform-pill">VASP Registry</span>
          <span className="platform-pill">SAHYOG Push</span>
          <span className="platform-pill">Section 63 Dossier</span>
        </div>
      </div>
      <form className="cta-form" id="brief-form">
        <label htmlFor="f1">Officer name</label>
        <input id="f1" type="text" placeholder="Full name and rank" />
        <label htmlFor="f2">Agency or unit</label>
        <input id="f2" type="text" placeholder="e.g. Cyber Crime Cell, Ahmedabad" />
        <label htmlFor="f3">Official email</label>
        <input id="f3" type="email" placeholder="name@agency.gov.in" />
        <label htmlFor="f4">Primary interest</label>
        <select id="f4">
          <option>Wallet attribution and tracing</option>
          <option>SAHYOG integration</option>
          <option>Evidentiary dossier generation</option>
          <option>Multi-unit deployment</option>
        </select>
        <button className="btn-primary" type="submit">Request a briefing</button>
        <p className="fine">Submissions reach the project team only. This prototype holds no operational case data and is not connected to a live government system.</p>
      </form>
    </div>
  </div>
</section>

<footer>
  <div className="wrap footer-row">
    <div className="logo">Trace</div>
    <div className="foot-links">
      <a href="#how">How it works</a>
      <a href="#statutory">Statutory output</a>
      <a href="#sovereignty">Data sovereignty</a>
      <a href="/dashboard">Console</a>
    </div>
    <div className="copyright">© 2026 Trace · Automated VASP Attribution · SIH 2026 Problem Statement 26182</div>
  </div>
</footer>
    </div>
  );
}
