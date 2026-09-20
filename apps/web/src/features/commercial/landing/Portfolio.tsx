import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

export function Portfolio() {
  const [score, setScore] = useState("0.0");
  const [animated, setAnimated] = useState(false);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = inspectorRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animated) {
            setAnimated(true);
            const target = 11.4;
            const duration = 1100;
            const start = performance.now();

            function tick(now: number) {
              const p = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - p, 3);
              setScore((eased * target).toFixed(1));
              if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [animated]);

  return (
    <section className={styles.inspectorSection} id="portfolio">
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>trace inspector</p>
          <h2>Transparent evidence trail for every hop</h2>
          <p>
            Inspect the winning attribution path from suspect wallet to exchange deposit, complete
            with transaction values, recency weighting, and risk flags.
          </p>
        </div>

        <div className={styles.inspector} ref={inspectorRef}>
          <div className={styles.inspectorBar}>
            <div className={styles.traffic}>
              <span />
              <span />
              <span />
            </div>
            trace_0x742d…bD1e · 3 hops · Score{" "}
            <span id="total-value" style={{ color: "var(--text)", fontWeight: 600 }}>
              {score}
            </span>{" "}
            / 15 · Confidence: HIGH
          </div>

          <div className={styles.inspectorBody}>
            <div className={styles.inspectorTree}>
              <div className={styles.treeRow}>
                <span className={styles.left}>
                  <span className={`${styles.badge} ${styles.bAlt}`} />
                  Hop 0 · 0x742d…bD1e
                </span>
                <span className={styles.chg}>Origin</span>
              </div>
              <div className={styles.treeRow}>
                <span className={styles.left}>
                  <span className={`${styles.badge} ${styles.bBtc}`} />
                  Hop 1 · 0x1a82…e93f
                </span>
                <span className={`${styles.chg} ${styles.up}`}>Structuring ⚡</span>
              </div>
              <div className={styles.treeRow}>
                <span className={styles.left}>
                  <span className={`${styles.badge} ${styles.bEth}`} />
                  Hop 2 · 0x3f5c…841a
                </span>
                <span className={`${styles.chg} ${styles.up}`}>USDT Transfer</span>
              </div>
              <div className={`${styles.treeRow} ${styles.treeRowActive}`}>
                <span className={styles.left}>
                  <span className={`${styles.badge} ${styles.bGreen}`} />
                  Hop 3 · Binance Hot 14
                </span>
                <span className={`${styles.chg} ${styles.up}`}>Deposit 🎯</span>
              </div>
            </div>

            <div className={styles.inspectorWaterfall}>
              <div className={styles.wfRow}>
                <span className={styles.wfLabel}>Origin Wallet</span>
                <span className={styles.wfTrack}>
                  <span
                    className={styles.wfBar}
                    style={{
                      width: animated ? "100%" : "0%",
                      background: "#5c5c6c",
                    }}
                  />
                </span>
                <span className={styles.wfTime}>Target query</span>
              </div>

              <div className={styles.wfRow}>
                <span className={styles.wfLabel}>Split Transfers</span>
                <span className={styles.wfTrack}>
                  <span
                    className={styles.wfBar}
                    style={{
                      width: animated ? "76%" : "0%",
                      background: "#f7931a",
                    }}
                  />
                </span>
                <span className={styles.wfTime}>4 txs · Clustered</span>
              </div>

              <div className={styles.wfRow}>
                <span className={styles.wfLabel}>USDT Liquidity</span>
                <span className={styles.wfTrack}>
                  <span
                    className={styles.wfBar}
                    style={{
                      width: animated ? "62%" : "0%",
                      background: "#8c9dfc",
                    }}
                  />
                </span>
                <span className={styles.wfTime}>$48,200 · 3d ago</span>
              </div>

              <div className={styles.wfRow}>
                <span className={styles.wfLabel}>Binance Deposit</span>
                <span className={styles.wfTrack}>
                  <span
                    className={styles.wfBar}
                    style={{
                      width: animated ? "94%" : "0%",
                      background: "#2fe3a3",
                    }}
                  />
                </span>
                <span className={styles.wfTime}>VASP Match</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
