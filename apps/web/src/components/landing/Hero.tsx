import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { LandingScene } from "./LandingScene";
import styles from "./landing.module.css";

import { useCryptoPrices } from "@/hooks/use-crypto-prices";

export function Hero() {
  const [selectedNode, setSelectedNode] = useState<{
    name: string;
    label: string;
    score: string;
  }>({
    name: "Target: 0x742d…bD1e",
    label: "Binance Hot 14",
    score: "2 Hops · Score 9.4",
  });

  const { prices } = useCryptoPrices();

  useEffect(() => {
    if (prices && selectedNode.name === "Target: 0x742d…bD1e") {
      setSelectedNode({
        name: "Bitcoin (BTC)",
        label: `$${prices.bitcoin.usd.toLocaleString()}`,
        score: `${prices.bitcoin.usd_24h_change >= 0 ? "+" : ""}${prices.bitcoin.usd_24h_change.toFixed(2)}%`,
      });
    }
  }, [prices]);

  return (
    <>
      <header className={styles.header}>
        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span className={styles.coinBadge}>
              <span className={styles.spin}>
                <span className={`${styles.face} ${styles.front}`}>&#8383;</span>
                <span className={`${styles.face} ${styles.faceBack}`}>&#926;</span>
              </span>
            </span>
            Trace
          </div>
          <div className={styles.navLinks}>
            <a href="#track">Capabilities</a>
            <a href="#portfolio">Trace Inspector</a>
            <a href="#how">How it works</a>
            <Link to="/login">Log in</Link>
          </div>
          <Link to="/signup" className={styles.navCta}>
            Start tracing
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <LandingScene onSelectNode={(info) => setSelectedNode(info)} prices={prices} />
        <div className={styles.heroVignette} />

        <div className={styles.heroHint}>
          <span className={styles.ring} />
          drag to orbit · click nodes
        </div>

        <div className={styles.coinInfo}>
          <div className={`${styles.ciName} ${styles.mono}`}>{selectedNode.name}</div>
          <div className={styles.ciPrice}>{selectedNode.label}</div>
          <div className={`${styles.ciChange} ${styles.up}`}>{selectedNode.score}</div>
        </div>

        <div className={styles.wrap}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrowTag}>
              <span className={styles.dot} />
              Live graph attribution engine
            </span>
            <h1>Trace any wallet to its nearest exchange</h1>
            <p>
              Trace Ethereum and stablecoin transactions across the graph to deposit addresses at
              Binance, Coinbase, Kraken, and 360+ exchanges — with transparent hop scoring,
              structuring detection, and sanctions screening.
            </p>
            <div className={styles.heroActions}>
              <Link to="/signup" className={styles.btnPrimary}>
                Start tracing now
              </Link>
              <Link to="/dashboard" className={styles.btnGhost}>
                Try live demo →
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.heroTicker}>
          <span className={styles.tItem}>
            <span className={styles.sym}>BTC</span>{" "}
            <span className={prices?.bitcoin.usd_24h_change && prices.bitcoin.usd_24h_change >= 0 ? styles.up : styles.down}>
              ${prices?.bitcoin.usd.toLocaleString() || "---"} · {prices?.bitcoin.usd_24h_change ? `${prices.bitcoin.usd_24h_change >= 0 ? "+" : ""}${prices.bitcoin.usd_24h_change.toFixed(2)}%` : "---"}
            </span>
          </span>
          <span className={styles.tItem}>
            <span className={styles.sym}>ETH</span>{" "}
            <span className={prices?.ethereum.usd_24h_change && prices.ethereum.usd_24h_change >= 0 ? styles.up : styles.down}>
              ${prices?.ethereum.usd.toLocaleString() || "---"} · {prices?.ethereum.usd_24h_change ? `${prices.ethereum.usd_24h_change >= 0 ? "+" : ""}${prices.ethereum.usd_24h_change.toFixed(2)}%` : "---"}
            </span>
          </span>
          <span className={styles.tItem}>
            <span className={styles.sym}>SOL</span>{" "}
            <span className={prices?.solana.usd_24h_change && prices.solana.usd_24h_change >= 0 ? styles.up : styles.down}>
              ${prices?.solana.usd.toLocaleString() || "---"} · {prices?.solana.usd_24h_change ? `${prices.solana.usd_24h_change >= 0 ? "+" : ""}${prices.solana.usd_24h_change.toFixed(2)}%` : "---"}
            </span>
          </span>
        </div>
      </section>
    </>
  );
}
