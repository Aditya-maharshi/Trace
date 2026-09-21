import styles from "./landing.module.css";
import { Link } from "@tanstack/react-router";

export function SharedFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.wrap} ${styles.footerRow}`}>
        <Link to="/" className={styles.logo}>Trace</Link>
        <div className={styles.footLinks}>
          <a href="#track">Capabilities</a>
          <a href="#portfolio">Trace Inspector</a>
          <a href="#how">How it works</a>
          <Link to="/methodology">Methodology</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
        </div>
        <div className={styles.copyright}>© {new Date().getFullYear()} Trace · Blockchain Forensics</div>
      </div>
    </footer>
  );
}
