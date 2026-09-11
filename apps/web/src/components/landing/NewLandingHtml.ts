export const landingHtml = `
<header>
  <nav>
    <div class="logo">Trace</div>
    <div class="nav-links">
      <a href="#track">What it tracks</a>
      <a href="#how">How it works</a>
      <a href="/methodology">Methodology</a>
      <a href="/login">Log in</a>
    </div>
    <a href="/dashboard" class="nav-cta">Launch Engine</a>
  </nav>
</header>

<section class="hero">
  <canvas id="hero-canvas"></canvas>
  <div class="hero-vignette"></div>
  <div class="hero-hint"><span class="ring"></span>drag to orbit · click node</div>
  <div id="coin-info">
    <div class="ci-header">
      <span class="ci-name" id="ci-name">Bitcoin</span>
      <span class="ci-sym" id="ci-sym">BTC</span>
    </div>
    <div class="ci-price" id="ci-price">$77,144.60</div>
    <div class="ci-change down" id="ci-change">▼ 1.27%</div>
  </div>
  <div class="hero-content">
    <span class="eyebrow-tag"><span class="dot"></span>Blockchain Intelligence Engine</span>
    <h1>Automated Attribution of Unknown Crypto Wallets to Nearest VASPs</h1>
    <p>Trace unhosted wallets through multi-hop on-chain transaction graphs to identify regulated exchanges, cross-chain bridge exits, mixer interactions, and AML structuring signals.</p>
    <div class="hero-actions">
      <a href="/dashboard" class="btn-primary">Launch Trace Engine</a>
      <a href="/methodology" class="btn-ghost">View AML Methodology →</a>
    </div>
  </div>
  <div class="hero-ticker">
    <div class="ticker-pill">
      <span class="pulse-dot"></span>
      <span class="ticker-label">LIVE MARKETS</span>
    </div>
    <div class="t-item">
      <span class="sym">BTC</span>
      <span class="val" id="tick-btc-val">$77,144.60</span>
      <span class="chg down" id="tick-btc-chg">▼ 1.27%</span>
    </div>
    <div class="t-divider"></div>
    <div class="t-item">
      <span class="sym">ETH</span>
      <span class="val" id="tick-eth-val">$2,463.58</span>
      <span class="chg down" id="tick-eth-chg">▼ 0.37%</span>
    </div>
    <div class="t-divider"></div>
    <div class="t-item">
      <span class="sym">SOL</span>
      <span class="val" id="tick-sol-val">$99.50</span>
      <span class="chg down" id="tick-sol-chg">▼ 1.66%</span>
    </div>
  </div>
</section>

<section class="track" id="track">
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">what it tracks</p>
      <h2>Deep On-Chain Intelligence Across Every Hop</h2>
      <p>Automated heuristics, verified contract registries, and real-time sanctions screening uncover fund flows across complex transaction topologies.</p>
    </div>
    <div class="track-grid" id="track-grid">
      <div class="track-card">
        <span class="tag mono">vasp.attribution</span>
        <h3>Nearest VASP Mapping</h3>
        <p>Breadth-First Search (BFS) graph traversal identifying the shortest transaction path to verified Virtual Asset Service Providers like Binance, Coinbase, and Kraken.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,24 30,24 40,10 55,26 70,8 90,8 100,18 130,18 145,4 165,20 190,20 205,6 225,14 260,14 275,22 300,10" fill="none" stroke="#f7931a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">aml.structuring</span>
        <h3>Smurfing &amp; Structuring Signals</h3>
        <p>Identifies peeling chains, fan-out patterns, and transaction amounts split just below regulatory AML reporting thresholds to evade oversight.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,26 25,26 35,14 55,22 75,10 100,10 115,18 135,4 155,12 300,4" fill="none" stroke="#8c9dfc" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">bridge.exits</span>
        <h3>Cross-Chain Bridge Detection</h3>
        <p>Flags when funds exit Ethereum mainnet via cross-chain bridge contracts (Arbitrum, Optimism, Polygon, Hop) with contract registry verification.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,20 40,20 50,30 60,20 80,20 90,4 100,20 130,20 145,28 165,20 300,12" fill="none" stroke="#2fe3a3" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">sanctions.screening</span>
        <h3>Mixer Exposure &amp; OFAC Screening</h3>
        <p>Live screening against OFAC and global consolidated sanctions lists via OpenSanctions, identifying direct and indirect exposure to mixers like Tornado Cash.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,10 30,10 42,28 58,4 72,20 95,20 105,14 300,20" fill="none" stroke="#ff5c7a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
    </div>
  </div>
</section>

<section class="how" id="how">
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">how it works</p>
      <h2>Algorithmic Attribution in 3 Automated Steps</h2>
      <p>Purpose-built for compliance officers, law enforcement, and forensic investigators needing fast, defensible wallet attribution.</p>
    </div>
    <div class="how-steps">
      <div class="how-step">
        <span class="num mono">01</span>
        <h3>Ingest Unknown Wallet Address</h3>
        <p>Submit any Ethereum wallet address or transaction. Trace validates formatting and fetches transaction history from Etherscan and Blockscout with automatic failover.</p>
      </div>
      <div class="how-step">
        <span class="num mono">02</span>
        <h3>Recursive BFS Graph Traversal</h3>
        <p>The engine traverses the transfer network up to configurable depth limits, matching addresses against verified VASP clusters and computing decay-weighted confidence scores.</p>
      </div>
      <div class="how-step">
        <span class="num mono">03</span>
        <h3>Forensic Report &amp; AI Narration</h3>
        <p>Export court-ready PDF/CSV audit reports, explore an interactive D3/SVG graph, and interrogate findings with an AI compliance analyst citing specific path hops.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta-section" id="get-started">
  <div class="wrap">
    <div class="cta-box">
      <h2>Trace unknown crypto wallets with confidence</h2>
      <p>Automated, explainable, and compliant blockchain intelligence without enterprise pricing.</p>
      <div class="cta-platforms">
        <span class="platform-pill">Multi-hop BFS</span>
        <span class="platform-pill">VASP Registry</span>
        <span class="platform-pill">OFAC Screening</span>
        <span class="platform-pill">AI Narration</span>
      </div>
      <div><a href="/dashboard" class="btn-primary">Launch Trace Engine</a></div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap footer-row">
    <div class="logo">Trace</div>
    <div class="foot-links">
      <a href="#track">What it tracks</a>
      <a href="#how">How it works</a>
      <a href="/methodology">Methodology</a>
      <a href="/dashboard">Dashboard</a>
    </div>
    <div class="copyright">© 2026 Trace · Automated VASP Attribution Engine</div>
  </div>
</footer>
`;
