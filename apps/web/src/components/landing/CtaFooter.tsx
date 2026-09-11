import { Link } from "@tanstack/react-router";
import styles from "./landing.module.css";

export function CtaFooter() {
  return (
    <>
      <section className={styles.ctaSection} id="get-started">
        <div className={styles.wrap}>
          <div className={styles.ctaBox}>
            <h2>Start investigating crypto wallet flows today</h2>
            <p>
              Instant access for compliance officers, fraud investigators, and law enforcement
              teams.
            </p>
            <div className={styles.ctaPlatforms}>
              <span className={styles.platformPill}>360+ Verified VASPs</span>
              <span className={styles.platformPill}>OpenSanctions Screening</span>
              <span className={styles.platformPill}>REST API &amp; Webhook Ready</span>
            </div>
            <div>
              <Link to="/signup" className={styles.btnPrimary}>
                Start tracing for free
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerRow}`}>
          <div className={styles.logo}>Trace</div>
          <div className={styles.footLinks}>
            <a href="#track">Capabilities</a>
            <a href="#portfolio">Trace Inspector</a>
            <a href="#how">How it works</a>
          </div>
          <div className={styles.copyright}>© 2026 Trace · Blockchain Forensics</div>
        </div>
      </footer>
    </>
  );
}
