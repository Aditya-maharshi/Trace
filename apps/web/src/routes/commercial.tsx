import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { SharedNav } from "../components/landing/SharedNav";
import { CommercialHero } from "../components/landing/CommercialHero";
import { Track } from "../components/landing/Track";
import { How } from "../components/landing/How";
import { Portfolio } from "../components/landing/Portfolio";
import { CommercialCta } from "../components/landing/CommercialCta";
import { SharedFooter } from "../components/landing/SharedFooter";
import { initLandingScript } from "../lib/new-landing-script";

export const Route = createFileRoute("/commercial")({
  head: () => ({
    meta: [
      { title: "Trace for Commercial — Trace unhosted wallets to Nearest VASPs" },
      {
        name: "description",
        content:
          "Instant access to trace Ethereum and stablecoin transactions across the graph to deposit addresses at 360+ exchanges.",
      },
    ],
  }),
  component: CommercialLanding,
});

function CommercialLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentRef = rootRef.current;
    const cleanup = currentRef ? initLandingScript(currentRef) : null;
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div 
      id="trace-landing-root" 
      ref={rootRef}
      className="bg-[#06060a] min-h-screen text-[#f2f2f7] antialiased overflow-x-hidden font-['Space_Grotesk']"
    >
      <SharedNav crossLink={{ to: "/government", label: "For agencies" }} />
      <CommercialHero />
      <Track />
      <How />
      <Portfolio />
      <CommercialCta />
      <SharedFooter />
    </div>
  );
}
