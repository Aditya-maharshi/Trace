export const landingHtml = `
<header>
  <nav>
    <div class="logo">Trace</div>
    <div class="nav-links">
      <a href="#track">What it tracks</a>
      <a href="#portfolio">Portfolio</a>
      <a href="#how">How it works</a>
      <a href="/login">Log in</a>
    </div>
    <a href="/signup" class="nav-cta">Start tracking</a>
  </nav>
</header>

<section class="hero">
  <canvas id="hero-canvas"></canvas>
  <div class="hero-vignette"></div>
  <div class="hero-hint"><span class="ring"></span>drag to orbit · click a coin</div>
  <div id="coin-info">
    <div class="ci-name mono" id="ci-name">Bitcoin</div>
    <div class="ci-price" id="ci-price">$---</div>
    <div class="ci-change up" id="ci-change">---</div>
  </div>
  <div class="hero-content">
    <span class="eyebrow-tag"><span class="dot"></span>Live prices updating now</span>
    <h1>Trace every move the market makes</h1>
    <p>See your Bitcoin, Ethereum and altcoin holdings in one live view — real-time prices, portfolio value, and alerts the moment something moves.</p>
    <div class="hero-actions">
      <a href="/signup" class="btn-primary">Start tracking for free</a>
      <a href="/dashboard" class="btn-ghost">See a live portfolio →</a>
    </div>
  </div>
  <div class="hero-ticker">
    <span class="t-item"><span class="sym">BTC</span> <span class="up" id="tick-btc">$---</span></span>
    <span class="t-item"><span class="sym">ETH</span> <span class="up" id="tick-eth">$---</span></span>
    <span class="t-item"><span class="sym">SOL</span> <span class="down" id="tick-sol">$---</span></span>
  </div>
</section>

<section class="track" id="track">
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">what it tracks</p>
      <h2>Everything that moves your portfolio, in one place</h2>
      <p>Connect a wallet or exchange once. Trace keeps every balance and price current without you refreshing a thing.</p>
    </div>
    <div class="track-grid" id="track-grid">
      <div class="track-card">
        <span class="tag mono">live.price</span>
        <h3>Real-time prices</h3>
        <p>Live price and 24-hour change for every coin you hold, updated as the market moves.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,24 30,24 40,10 55,26 70,8 90,8 100,18 130,18 145,4 165,20 190,20 205,6 225,14 260,14 275,22 300,10" fill="none" stroke="#f7931a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">wallet.sync</span>
        <h3>Portfolio value</h3>
        <p>Balances from every connected wallet and exchange, rolled up into one total and broken down by coin.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,26 25,26 35,14 55,22 75,10 100,10 115,18 135,4 155,12 300,4" fill="none" stroke="#8c9dfc" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">alert.price</span>
        <h3>Price alerts</h3>
        <p>Set a target price or percentage move on any coin and get notified the second it's hit.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,20 40,20 50,30 60,20 80,20 90,4 100,20 130,20 145,28 165,20 300,12" fill="none" stroke="#2fe3a3" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
      <div class="track-card">
        <span class="tag mono">chain.status</span>
        <h3>Network &amp; gas fees</h3>
        <p>Current gas fees and network congestion, so you know when it's actually a good time to move funds.</p>
        <svg class="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none"><polyline points="0,10 30,10 42,28 58,4 72,20 95,20 105,14 300,20" fill="none" stroke="#ff5c7a" stroke-width="1.5" opacity="0.85"/></svg>
      </div>
    </div>
  </div>
</section>

<section class="inspector-section" id="portfolio">
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">the portfolio view</p>
      <h2>Your whole portfolio, broken down by coin</h2>
      <p>See exactly how much of your portfolio is in each coin, what it's worth today, and how it's moved.</p>
    </div>
    <div class="inspector" id="inspector">
      <div class="inspector-bar">
        <div class="traffic"><span></span><span></span><span></span></div>
        portfolio_main · 4 coins · $<span id="total-value">0</span> total
      </div>
      <div class="inspector-body">
        <div class="inspector-tree">
          <div class="tree-row active"><span class="left"><span class="badge b-btc"></span>Bitcoin</span><span class="chg up" id="tree-btc-change">---</span></div>
          <div class="tree-row"><span class="left"><span class="badge b-eth"></span>Ethereum</span><span class="chg up" id="tree-eth-change">---</span></div>
          <div class="tree-row"><span class="left"><span class="badge b-alt"></span>Solana</span><span class="chg down" id="tree-sol-change">---</span></div>
          <div class="tree-row"><span class="left"><span class="badge b-alt"></span>USDC</span><span class="chg">0.0%</span></div>
        </div>
        <div class="inspector-waterfall">
          <div class="wf-row"><span class="wf-label">Bitcoin</span><span class="wf-track"><span class="wf-bar" id="wf-btc-bar" data-width="52" style="background:#f7931a;"></span></span><span class="wf-time" id="wf-btc-text">$--- · --%</span></div>
          <div class="wf-row"><span class="wf-label">Ethereum</span><span class="wf-track"><span class="wf-bar" id="wf-eth-bar" data-width="31" style="background:#8c9dfc;"></span></span><span class="wf-time" id="wf-eth-text">$--- · --%</span></div>
          <div class="wf-row"><span class="wf-label">Solana</span><span class="wf-track"><span class="wf-bar" id="wf-sol-bar" data-width="11" style="background:#c9c9d8;"></span></span><span class="wf-time" id="wf-sol-text">$--- · --%</span></div>
          <div class="wf-row"><span class="wf-label">USDC</span><span class="wf-track"><span class="wf-bar" id="wf-usdc-bar" data-width="6" style="background:#5c5c6c;"></span></span><span class="wf-time" id="wf-usdc-text">$--- · --%</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="how" id="how">
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">how it works</p>
      <h2>Connect once, tracked forever</h2>
      <p>Trace reads balances directly from wallets and exchanges. No manual entry, nothing to keep updating.</p>
    </div>
    <div class="how-steps">
      <div class="how-step">
        <span class="num mono">01</span>
        <h3>Connect a wallet or exchange</h3>
        <p>Add a public wallet address or link an exchange account in read-only mode.</p>
      </div>
      <div class="how-step">
        <span class="num mono">02</span>
        <h3>Balances sync automatically</h3>
        <p>Trace pulls current balances and prices in the background, so your portfolio total is always current.</p>
      </div>
      <div class="how-step">
        <span class="num mono">03</span>
        <h3>Get alerts, drill into any coin</h3>
        <p>Set price alerts and open any coin to see its full history against the rest of your portfolio.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta-section" id="get-started">
  <div class="wrap">
    <div class="cta-box">
      <h2>Start tracking your portfolio today</h2>
      <p>Free for up to 5 wallets and unlimited price alerts.</p>
      <div class="cta-platforms">
        <span class="platform-pill">iOS</span>
        <span class="platform-pill">Android</span>
        <span class="platform-pill">Chrome extension</span>
      </div>
      <div><a href="/signup" class="btn-primary">Start tracking for free</a></div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap footer-row">
    <div class="logo">Trace</div>
    <div class="foot-links">
      <a href="#track">What it tracks</a>
      <a href="#portfolio">Portfolio</a>
      <a href="#how">How it works</a>
    </div>
    <div class="copyright">© 2026 Trace</div>
  </div>
</footer>
`;
