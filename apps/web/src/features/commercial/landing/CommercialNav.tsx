import { Link } from "@tanstack/react-router";
import styles from "./landing.module.css";
import { useState } from "react";

interface SharedNavProps {
  crossLink?: {
    to: string;
    label: string;
  };
}

export function SharedNav({ crossLink }: SharedNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.logo}>
          <span className={styles.coinBadge}>
            <span className={styles.spin}>
              <span className={`${styles.face} ${styles.front}`}>&#8383;</span>
              <span className={`${styles.face} ${styles.faceBack}`}>&#926;</span>
            </span>
          </span>
          Trace
        </Link>
        <div className={styles.navLinks}>
          <a href="#track">Capabilities</a>
          <a href="#portfolio">Trace Inspector</a>
          <a href="#how">How it works</a>
          <Link to="/login">Log in</Link>
          {crossLink && (
            <Link to={crossLink.to} className="text-white/60 hover:text-white transition-colors ml-4 text-sm font-medium">
              {crossLink.label}
            </Link>
          )}
        </div>
        <Link to="/signup" className={`${styles.navCta} ${styles.navCtaDesktop}`}>
          Start tracing
        </Link>
        {/* Mobile hamburger */}
        <button
          className={styles.hamburger}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`${styles.hLine} ${menuOpen ? styles.hLineOpen1 : ""}`} />
          <span className={`${styles.hLine} ${menuOpen ? styles.hLineOpen2 : ""}`} />
          <span className={`${styles.hLine} ${menuOpen ? styles.hLineOpen3 : ""}`} />
        </button>
      </nav>
      {/* Mobile dropdown */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          <a href="#track" onClick={() => setMenuOpen(false)}>Capabilities</a>
          <a href="#portfolio" onClick={() => setMenuOpen(false)}>Trace Inspector</a>
          <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
          <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
          {crossLink && (
            <Link to={crossLink.to} onClick={() => setMenuOpen(false)}>{crossLink.label}</Link>
          )}
          <Link to="/signup" className={styles.navCta} onClick={() => setMenuOpen(false)}>Start tracing</Link>
        </div>
      )}
    </header>
  );
}
