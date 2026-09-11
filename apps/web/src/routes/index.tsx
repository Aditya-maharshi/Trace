import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { landingHtml } from "../components/landing/NewLandingHtml";
import { initLandingScript } from "../lib/new-landing-script";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trace — Track every move the market makes" },
      {
        name: "description",
        content:
          "See your Bitcoin, Ethereum and altcoin holdings in one live view — real-time prices, portfolio value, and alerts the moment something moves.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We run the init script to bind the Three.js canvas and intersection observers
    // The script expects elements with IDs to exist in the DOM.
    const currentRef = rootRef.current;
    const cleanup = currentRef ? initLandingScript(currentRef) : null;

    // Re-bind link clicks to Tanstack Router to avoid full page reloads for internal routes
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href && href.startsWith("/")) {
          e.preventDefault();
          router.navigate({ to: href as any });
        }
      }
    };

    if (currentRef) {
      currentRef.addEventListener("click", handleLinkClick);
    }

    return () => {
      if (cleanup) cleanup();
      if (currentRef) {
        currentRef.removeEventListener("click", handleLinkClick);
      }
    };
  }, [router]);

  return (
    <div 
      id="trace-landing-root" 
      ref={rootRef}
      dangerouslySetInnerHTML={{ __html: landingHtml }} 
      className="bg-[#06060a] min-h-screen text-[#f2f2f7] antialiased overflow-x-hidden font-['Space_Grotesk']"
    />
  );
}
