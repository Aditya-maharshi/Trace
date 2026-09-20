import { useState } from "react";
import { SharedNav } from "./CommercialNav";
import { CommercialHero } from "./CommercialHero";
import { LandingScene } from "./LandingScene";
import { Portfolio } from "./Portfolio";
import { Track } from "./Track";
import { How } from "./How";
import { CommercialCta } from "./CommercialCta";
import { SharedFooter } from "./CommercialFooter";
import styles from "./landing.module.css";
import { useCryptoPrices } from "@/features/commercial/hooks/use-crypto-prices";

export function CommercialLandingPage() {
  const { prices } = useCryptoPrices();
  const [selectedNode, setSelectedNode] = useState<{ name: string; label: string; score: string } | null>(null);

  void selectedNode; // consumed by future tooltip

  return (
    <div className={styles.root}>
      <SharedNav />
      <div className={styles.heroSceneContainer}>
        <LandingScene onSelectNode={(info) => setSelectedNode(info)} prices={prices} />
        <CommercialHero />
      </div>
      <Portfolio />
      <Track />
      <How />
      <CommercialCta />
      <SharedFooter />
    </div>
  );
}
