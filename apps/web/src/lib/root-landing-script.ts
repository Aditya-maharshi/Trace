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

const INTRO_SEEN_KEY = "trace_intro_seen";
const INTRO_START_TIMEOUT = 2500;
const INTRO_MAX_DURATION = 9000;

function initIntro(root: HTMLElement): () => void {
  const intro = root.querySelector<HTMLDivElement>("#intro");
  const video = root.querySelector<HTMLVideoElement>("#introVideo");
  const skip = root.querySelector<HTMLButtonElement>("#introSkip");
  if (!intro || !video || !skip) return () => {};

  const html = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let alreadySeen = false;
  try {
    alreadySeen = sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    /* private mode — just play the intro */
  }
  if (reduceMotion || alreadySeen) return () => {};

  html.classList.add(INTRO_CLASS);

  let finished = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  function later(fn: () => void, ms: number) {
    timers.push(setTimeout(fn, ms));
  }

  function finish() {
    if (finished) return;
    finished = true;
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* the intro just replays on the next visit */
    }
    timers.forEach(clearTimeout);
    video?.pause();
    intro?.classList.add("leaving");
    html.classList.remove(INTRO_CLASS);
    later(() => intro?.classList.add("gone"), 1400);
  }

  // Whatever the video does — blocked autoplay, a stalled network, a codec the
  // browser rejects — the page must never stay behind the overlay.
  later(finish, INTRO_MAX_DURATION);
  const startGuard = setTimeout(() => {
    if (video.currentTime === 0 || video.paused) finish();
  }, INTRO_START_TIMEOUT);
  timers.push(startGuard);

  const onPlaying = () => clearTimeout(startGuard);
  const onEnded = () => later(finish, 500);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") finish();
  };

  video.addEventListener("playing", onPlaying);
  video.addEventListener("ended", onEnded);
  video.addEventListener("error", finish);
  skip.addEventListener("click", finish);
  intro.addEventListener("click", finish);
  document.addEventListener("keydown", onKeyDown);

  video.muted = true;
  video.volume = 0;
  const played = video.play();
  if (played && typeof played.catch === "function") played.catch(finish);

  return () => {
    timers.forEach(clearTimeout);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("error", finish);
    skip.removeEventListener("click", finish);
    intro.removeEventListener("click", finish);
    document.removeEventListener("keydown", onKeyDown);
    html.classList.remove(INTRO_CLASS);
  };
}

export function initRootLanding(root: HTMLElement): () => void {
  const cleanups = [initNav(root), initSmoothScroll(root), initReveal(root), initIntro(root)];
  return () => cleanups.forEach((fn) => fn());
}
