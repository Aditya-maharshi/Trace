import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { initRootLanding } from "@/lib/root-landing-script";
import "@/styles/root-landing.css";

export function RootLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return initRootLanding(root);
  }, []);

  return (
    <div id="trace-root-landing" ref={rootRef}>
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
        focusable="false"
      >
        <symbol id="trace-mark" viewBox="-47 -47 94 94">
          <g fill="none">
            <g strokeWidth="4.2">
              <path stroke="#F5A300" d="M32.15 7.42A33 33 0 0 1 7.42 32.15" />
              <path stroke="#C1986E" d="M-7.42 32.15A33 33 0 0 1 -32.15 7.42" />
              <path stroke="#F5A300" d="M-32.15 -7.42A33 33 0 0 1 -7.42 -32.15" />
              <path stroke="#C1986E" d="M7.42 -32.15A33 33 0 0 1 32.15 -7.42" />
            </g>
            <g stroke="#FAB808" strokeWidth="3.2">
              <path d="M0 -44V-21.5" />
              <path d="M0 21.5V44" />
              <path d="M-44 0H-21.5" />
              <path d="M21.5 0H44" />
            </g>
          </g>
          <circle r="11.8" fill="#F5A300" />
        </symbol>
      </svg>

      <div id="intro" role="dialog" aria-modal="true" aria-label="Trace intro">
        <video
          id="introVideo"
          src="/trace-intro.mp4"
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback"
          tabIndex={-1}
        ></video>
        <button type="button" className="intro-skip" id="introSkip" aria-label="Skip intro">
          Skip
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 5l9 7-9 7V5zM19 5v14" />
          </svg>
        </button>
      </div>

      <div className="ambient">
        <div className="orb-a"></div>
        <div className="orb-b"></div>
        <div className="grid"></div>
      </div>

      <div className="advisory">
        Prototype · <b>SIH 2026 PS 26182</b> · Not an operational Government of India system
      </div>

      <header>
        <nav>
          <a className="logo-mark" href="#top" aria-label="Trace — home">
            <svg className="mark" aria-hidden="true">
              <use href="#trace-mark" />
            </svg>
            Trace
          </a>
          <button
            className="nav-toggle"
            id="navToggle"
            aria-label="Toggle navigation"
            aria-expanded="false"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="nav-links" id="navLinks">
            <a href="#about">About</a>
            <a href="#how">How it works</a>
            <a href="#capabilities">Capabilities</a>
            <a className="nav-enter" href="#enter">
              Enter
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/*================= HERO =================*/}
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="reveal in">
              <p className="meta-line">
                Blockchain Intelligence <span>·</span> VASP Attribution <span>·</span> Compliance
              </p>
              <h1>
                Trace the path
                <br />
                behind every <span className="accent">wallet.</span>
              </h1>
              <p className="lede">
                Wallet-to-VASP attribution for agencies and compliance teams. Trace helps
                investigators and compliance teams connect blockchain wallet activity with
                actionable attribution intelligence.
              </p>
              <div className="hero-actions">
                <a className="btn-primary" href="#enter">
                  Enter Trace
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: "15px", height: "15px" }}
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
                <a className="btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
            </div>

            <div className="reveal in">
              <div className="viz-panel">
                <div className="viz-hd">
                  <span>trace_path.svg</span>
                  <span className="live">
                    <i></i>live trace
                  </span>
                </div>
                <svg
                  id="trace-svg"
                  viewBox="0 0 460 220"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Diagram showing a wallet tracing through intermediary addresses to a VASP"
                >
                  <line
                    x1="55"
                    y1="45"
                    x2="165"
                    y2="45"
                    stroke="rgba(255,92,122,0.5)"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="165"
                    y1="45"
                    x2="165"
                    y2="110"
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="165"
                    y1="110"
                    x2="285"
                    y2="60"
                    stroke="rgba(240,180,41,0.5)"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="165"
                    y1="110"
                    x2="285"
                    y2="160"
                    stroke="rgba(240,180,41,0.5)"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="285"
                    y1="60"
                    x2="400"
                    y2="105"
                    stroke="rgba(140,157,252,0.55)"
                    strokeWidth="1.4"
                  />
                  <line
                    x1="285"
                    y1="160"
                    x2="400"
                    y2="105"
                    stroke="rgba(140,157,252,0.55)"
                    strokeWidth="1.4"
                  />

                  <circle cx="55" cy="45" r="7" fill="#100a08" stroke="#ff5c7a" strokeWidth="1.6" />
                  <text x="55" y="26" textAnchor="middle" className="viz-node-label">
                    SUSPECT
                  </text>
                  <text x="55" y="66" textAnchor="middle" className="viz-node-label">
                    0x7a2f…c41d
                  </text>

                  <circle
                    cx="165"
                    cy="45"
                    r="6"
                    fill="#0d0d15"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1.4"
                  />
                  <text x="165" y="26" textAnchor="middle" className="viz-node-label">
                    HOP 1
                  </text>

                  <circle
                    cx="165"
                    cy="110"
                    r="6"
                    fill="#0d0d15"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1.4"
                  />
                  <text x="128" y="114" textAnchor="middle" className="viz-node-label">
                    HOP 2
                  </text>

                  <circle
                    cx="285"
                    cy="60"
                    r="6.5"
                    fill="#191207"
                    stroke="#f0b429"
                    strokeWidth="1.6"
                  />
                  <text x="285" y="42" textAnchor="middle" className="viz-node-label">
                    SPLIT A
                  </text>

                  <circle
                    cx="285"
                    cy="160"
                    r="6.5"
                    fill="#191207"
                    stroke="#f0b429"
                    strokeWidth="1.6"
                  />
                  <text x="285" y="180" textAnchor="middle" className="viz-node-label">
                    SPLIT B
                  </text>

                  <circle
                    cx="400"
                    cy="105"
                    r="9"
                    fill="#07160f"
                    stroke="#2fe3a3"
                    strokeWidth="1.8"
                  />
                  <text
                    x="400"
                    y="82"
                    textAnchor="middle"
                    className="viz-node-label"
                    style={{ fill: "#2fe3a3" }}
                  >
                    VASP
                  </text>
                  <text x="400" y="132" textAnchor="middle" className="viz-node-label">
                    FIU-IND reg.
                  </text>
                </svg>
                <p className="viz-caption">wallet → intermediary hops → VASP deposit address</p>
              </div>
            </div>
          </div>
        </section>

        <div className="hero-divider wrap" style={{ maxWidth: "none" }}></div>

        {/*================= PROBLEM =================*/}
        <section className="problem" id="about">
          <div className="wrap">
            <div className="section-head reveal">
              <p className="eyebrow">Why Trace</p>
              <h2>Following the money isn't enough.</h2>
              <p>
                Crypto investigations and compliance workflows rarely start with a clean answer. A
                single reported wallet can span dozens of addresses before it reaches anything an
                investigator can act on.
              </p>
            </div>
            <div className="card-grid-4">
              <div className="mini-card reveal">
                <span className="num mono">01</span>
                <h3>Fragmented activity</h3>
                <p>
                  Transactions can span multiple wallets and services before any pattern becomes
                  visible.
                </p>
              </div>
              <div className="mini-card reveal">
                <span className="num mono">02</span>
                <h3>Attribution gap</h3>
                <p>A wallet address alone does not explain who or what sits behind it.</p>
              </div>
              <div className="mini-card reveal">
                <span className="num mono">03</span>
                <h3>Manual investigation</h3>
                <p>
                  Analysts often have to correlate multiple pieces of information by hand, hop by
                  hop.
                </p>
              </div>
              <div className="mini-card reveal">
                <span className="num mono">04</span>
                <h3>Actionable intelligence</h3>
                <p>
                  Trace aims to turn wallet activity into structured attribution intelligence an
                  investigator can use.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/*================= HOW IT WORKS =================*/}
        <section className="how" id="how">
          <div className="wrap">
            <div className="section-head reveal">
              <p className="eyebrow">How it works</p>
              <h2>From wallet activity to attribution.</h2>
              <p>
                Each stage narrows a wallet address down to something an investigator or compliance
                officer can act on.
              </p>
            </div>
            <div className="pipeline">
              <div className="p-step reveal">
                <div className="connector">
                  <div className="node mono">01</div>
                  <div className="stem"></div>
                </div>
                <div className="p-body">
                  <span className="p-tag">Input</span>
                  <h3>Wallet address</h3>
                  <p>
                    An investigator or compliance analyst enters a single suspect or subject wallet
                    address.
                  </p>
                </div>
              </div>
              <div className="p-step reveal">
                <div className="connector">
                  <div className="node mono">02</div>
                  <div className="stem"></div>
                </div>
                <div className="p-body">
                  <span className="p-tag">Processing</span>
                  <h3>Transaction analysis</h3>
                  <p>
                    Trace walks the on-chain transaction graph outward from that address, hop by
                    hop.
                  </p>
                </div>
              </div>
              <div className="p-step reveal">
                <div className="connector">
                  <div className="node mono">03</div>
                  <div className="stem"></div>
                </div>
                <div className="p-body">
                  <span className="p-tag">Resolution</span>
                  <h3>Entity / VASP identification</h3>
                  <p>
                    Terminal addresses are matched against a registry of known virtual asset service
                    providers.
                  </p>
                </div>
              </div>
              <div className="p-step reveal">
                <div className="connector">
                  <div className="node mono">04</div>
                  <div className="stem"></div>
                </div>
                <div className="p-body">
                  <span className="p-tag">Scoring</span>
                  <h3>Risk &amp; attribution intelligence</h3>
                  <p>
                    Findings are scored for confidence and flagged for patterns such as structuring
                    or mixing.
                  </p>
                </div>
              </div>
              <div className="p-step reveal">
                <div className="connector">
                  <div className="node mono">05</div>
                </div>
                <div className="p-body">
                  <span className="p-tag">Output</span>
                  <h3>Investigation dossier</h3>
                  <p>
                    Findings are organized into a structured view ready to support the next step of
                    a case.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/*================= CAPABILITIES =================*/}
        <section className="capabilities" id="capabilities">
          <div className="wrap">
            <div className="section-head reveal">
              <p className="eyebrow">Capabilities</p>
              <h2>What the platform is designed to support.</h2>
              <p>
                Trace is built around a small set of capabilities that map directly onto how an
                investigation or compliance review actually moves forward.
              </p>
            </div>
            <div className="cap-grid">
              <div className="cap-card reveal">
                <div className="cap-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                </div>
                <h3>Wallet intelligence</h3>
                <p>Analyze wallet activity and transaction relationships across chains.</p>
              </div>
              <div className="cap-card reveal">
                <div className="cap-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="6" cy="6" r="2.5" />
                    <circle cx="18" cy="18" r="2.5" />
                    <path d="M8 7.5l8 9" />
                  </svg>
                </div>
                <h3>VASP attribution</h3>
                <p>Connect wallet activity with the relevant virtual asset service provider.</p>
              </div>
              <div className="cap-card reveal">
                <div className="cap-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 3h9l3 3v15H6z" />
                    <path d="M9 11h6M9 15h6M9 7h3" />
                  </svg>
                </div>
                <h3>Investigation dossiers</h3>
                <p>Organize relevant findings into a single structured investigation view.</p>
              </div>
              <div className="cap-card reveal">
                <div className="cap-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
                  </svg>
                </div>
                <h3>Compliance screening</h3>
                <p>Support wallet screening before onboarding and other compliance workflows.</p>
              </div>
              <div className="cap-card reveal">
                <div className="cap-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12h5l2-7 4 14 2-7h3" />
                  </svg>
                </div>
                <h3>SAHYOG integration</h3>
                <p>
                  Intended integration with the SAHYOG portal for the agency workflow, as a project
                  capability.
                </p>
                <div className="cap-note">Prototype scope — not a live government connection</div>
              </div>
            </div>
          </div>
        </section>

        {/*================= TRANSITION =================*/}
        <section className="transition">
          <div className="wrap">
            <div className="section-head center reveal">
              <p className="eyebrow">Get started</p>
              <h2>Choose your entry point.</h2>
              <p>Trace adapts the investigation workflow to the role you are entering from.</p>
            </div>
          </div>
        </section>

        {/*================= GATEWAY (entry cards) =================*/}
        <section className="gateway" id="enter">
          <div className="wrap">
            <div className="gateway-inner">
              <div className="paths">
                <Link className="path-card agency reveal" to="/government">
                  <div className="path-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
                    </svg>
                  </div>
                  <h2>Government and law enforcement</h2>
                  <p>SAHYOG-integrated dossiers for I4C and state units.</p>
                  <span className="path-link">
                    Enter as an agency
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>

                <Link className="path-card business reveal" to="/dashboard">
                  <div className="path-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 21V8l8-5 8 5v13" />
                      <path d="M9 21v-6h6v6" />
                      <path d="M9 11h.01M9 15h.01M15 11h.01M15 15h.01" />
                    </svg>
                  </div>
                  <h2>Compliance teams and VASPs</h2>
                  <p>Screen and trace wallets before onboarding.</p>
                  <span className="path-link">
                    Enter as a business
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </div>

              <Link className="skip" to="/government">
                Skip to agency view
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer>© 2026 Trace · Automated VASP Attribution · SIH 2026 Problem Statement 26182</footer>
    </div>
  );
}
