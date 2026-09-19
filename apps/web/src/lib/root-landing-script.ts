const INTRO_CLASS = "trace-intro-on";

function initNav(root: HTMLElement): () => void {
  const toggle = root.querySelector<HTMLButtonElement>("#navToggle");
  const links = root.querySelector<HTMLDivElement>("#navLinks");
  if (!toggle || !links) return () => {};

  const onToggle = () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const onLinkClick = () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const anchors = Array.from(links.querySelectorAll("a"));
  toggle.addEventListener("click", onToggle);
  anchors.forEach((a) => a.addEventListener("click", onLinkClick));

  return () => {
    toggle.removeEventListener("click", onToggle);
    anchors.forEach((a) => a.removeEventListener("click", onLinkClick));
  };
}

function initSmoothScroll(root: HTMLElement): () => void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const handlers: Array<[HTMLAnchorElement, (e: Event) => void]> = [];

  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    const hash = a.getAttribute("href");
    if (!hash || hash.length < 2) return;
    let target: Element | null = null;
    try {
      target = root.querySelector(hash);
    } catch {
      return;
    }
    if (!target) return;

    const onClick = (e: Event) => {
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      try {
        history.pushState(null, "", hash);
      } catch {
        /* the scroll already happened, the URL update is cosmetic */
      }
    };
    a.addEventListener("click", onClick);
    handlers.push([a, onClick]);
  });

  return () => handlers.forEach(([a, h]) => a.removeEventListener("click", h));
}

function initReveal(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );
  items.forEach((el) => io.observe(el));

  return () => io.disconnect();
}

function initIntro(root: HTMLElement): () => void {
  const intro = root.querySelector<HTMLDivElement>("#intro");
  const video = root.querySelector<HTMLVideoElement>("#introVideo");
  const skip = root.querySelector<HTMLButtonElement>("#introSkip");
  if (!intro || !video || !skip) return () => {};

  const html = document.documentElement;
  html.classList.add(INTRO_CLASS);

  let finished = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(holdTimer);
    try {
      video?.pause();
    } catch {
      /* the overlay is going away regardless */
    }
    intro?.classList.add("leaving");
    html.classList.remove(INTRO_CLASS);
    removeTimer = setTimeout(() => intro?.remove(), 1400);
  }

  function onStarted() {
    clearTimeout(watchdog);
    const duration = video && isFinite(video.duration) ? video.duration : 3;
    watchdog = setTimeout(finish, duration * 1000 + 3000);
  }

  const onEnded = () => {
    holdTimer = setTimeout(finish, 500);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") finish();
  };

  video.addEventListener("ended", onEnded);
  video.addEventListener("error", finish);
  skip.addEventListener("click", finish);
  document.addEventListener("keydown", onKeyDown);

  video.muted = true;
  video.volume = 0;
  const played = video.play();
  if (played && typeof played.then === "function") played.then(onStarted, finish);
  else onStarted();

  return () => {
    clearTimeout(watchdog);
    clearTimeout(holdTimer);
    clearTimeout(removeTimer);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("error", finish);
    skip.removeEventListener("click", finish);
    document.removeEventListener("keydown", onKeyDown);
    html.classList.remove(INTRO_CLASS);
  };
}

export function initRootLanding(root: HTMLElement): () => void {
  const cleanups = [initNav(root), initSmoothScroll(root), initReveal(root), initIntro(root)];
  return () => cleanups.forEach((fn) => fn());
}
