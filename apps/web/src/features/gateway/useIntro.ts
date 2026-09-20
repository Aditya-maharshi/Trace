import { useEffect, useState } from "react";
import { INTRO_KEY, INTRO_SRC } from "./introConfig";

export function useIntro() {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(INTRO_KEY)) return;
    } catch {
      /* ignore */
    }
    fetch(INTRO_SRC, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && res.ok) {
          document.documentElement.classList.add("intro-on");
          setShowIntro(true);
        }
      })
      .catch(() => {
        /* no intro asset — show the page immediately */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function finishIntro() {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
    document.documentElement.classList.remove("intro-on");
    setShowIntro(false);
  }

  return { showIntro, finishIntro };
}
