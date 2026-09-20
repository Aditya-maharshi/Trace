import styles from "./landing.module.css";

export function How() {
  return (
    <section className={styles.how} id="how">
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>how it works</p>
          <h2>From address to attribution in seconds</h2>
          <p>
            Trace crawls the blockchain graph to connect mystery wallets to regulated institutions
            without cumbersome manual investigation.
          </p>
        </div>

        <div className={styles.howSteps}>
          <div className={styles.howStep}>
            <span className={`${styles.num} ${styles.mono}`}>01</span>
            <h3>Paste any Ethereum address</h3>
            <p>
              Enter an unlabelled wallet address or transaction hash. No wallet connection or
              private keys required.
            </p>
          </div>

          <div className={styles.howStep}>
            <span className={`${styles.num} ${styles.mono}`}>02</span>
            <h3>Graph engine traces the funds</h3>
            <p>
              Our BFS traversal engine crawls multi-hop ETH and stablecoin flows, ranking candidate
              paths by structuring signals, timing, and transaction velocity.
            </p>
          </div>

          <div className={styles.howStep}>
            <span className={`${styles.num} ${styles.mono}`}>03</span>
            <h3>Get scored results with evidence</h3>
            <p>
              Review the nearest identified VASP, empirical confidence rating, sanctions compliance
              check, and an AI-generated forensic narrative.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
