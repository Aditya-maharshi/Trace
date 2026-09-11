import React, { useRef } from "react";
import styles from "./landing.module.css";

interface CardTiltProps {
  children: React.ReactNode;
  className?: string;
}

function TiltCard({ children, className }: CardTiltProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateZ(4px)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(900px) rotateX(0) rotateY(0)";
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </div>
  );
}

export function Track() {
  return (
    <section className={styles.track} id="track">
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>core capabilities</p>
          <h2>Forensic intelligence across the transaction graph</h2>
          <p>
            Trace automates multi-hop entity resolution across Ethereum mainnet, combining empirical
            heuristics with real-time sanctions telemetry.
          </p>
        </div>

        <div className={styles.trackGrid}>
          <TiltCard className={styles.trackCard}>
            <span className={`${styles.tag} ${styles.mono}`}>sanctions.screen</span>
            <h3>Sanctions screening</h3>
            <p>
              Cross-references every intermediate address against OpenSanctions and OFAC lists in
              real-time. Immediately flags tainted flows with High Risk alerts.
            </p>
            <svg className={styles.traceSpark} viewBox="0 0 300 34" preserveAspectRatio="none">
              <polyline
                points="0,24 30,24 40,10 55,26 70,8 90,8 100,18 130,18 145,4 165,20 190,20 205,6 225,14 260,14 275,22 300,10"
                fill="none"
                stroke="#ff5c7a"
                strokeWidth="1.5"
                opacity="0.85"
              />
            </svg>
          </TiltCard>

          <TiltCard className={styles.trackCard}>
            <span className={`${styles.tag} ${styles.mono}`}>bridge.mixer</span>
            <h3>Mixer &amp; bridge detection</h3>
            <p>
              Detects exits to privacy protocols and cross-chain bridges (Arbitrum, Optimism,
              Polygon, Avalanche) before funds cross chains and go blind.
            </p>
            <svg className={styles.traceSpark} viewBox="0 0 300 34" preserveAspectRatio="none">
              <polyline
                points="0,26 25,26 35,14 55,22 75,10 100,10 115,18 135,4 155,12 300,4"
                fill="none"
                stroke="#f7931a"
                strokeWidth="1.5"
                opacity="0.85"
              />
            </svg>
          </TiltCard>

          <TiltCard className={styles.trackCard}>
            <span className={`${styles.tag} ${styles.mono}`}>structuring.detect</span>
            <h3>Structuring detection</h3>
            <p>
              Identifies smurfing and structuring signatures — multiple split transfers clustered in
              tight time windows below detection thresholds.
            </p>
            <svg className={styles.traceSpark} viewBox="0 0 300 34" preserveAspectRatio="none">
              <polyline
                points="0,20 40,20 50,30 60,20 80,20 90,4 100,20 130,20 145,28 165,20 300,12"
                fill="none"
                stroke="#8c9dfc"
                strokeWidth="1.5"
                opacity="0.85"
              />
            </svg>
          </TiltCard>

          <TiltCard className={styles.trackCard}>
            <span className={`${styles.tag} ${styles.mono}`}>tokens.erc20</span>
            <h3>ERC-20 &amp; stablecoin tracing</h3>
            <p>
              Traces native ETH alongside USDT, USDC, DAI, and WBTC token transfers, uncovering the
              OTC desk and mixer routes that ETH-only tools miss.
            </p>
            <svg className={styles.traceSpark} viewBox="0 0 300 34" preserveAspectRatio="none">
              <polyline
                points="0,10 30,10 42,28 58,4 72,20 95,20 105,14 300,20"
                fill="none"
                stroke="#2fe3a3"
                strokeWidth="1.5"
                opacity="0.85"
              />
            </svg>
          </TiltCard>
        </div>
      </div>
    </section>
  );
}
