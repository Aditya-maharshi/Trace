import { useState, useEffect } from "react";

export interface CryptoPriceData {
  bitcoin: { usd: number; usd_24h_change: number };
  ethereum: { usd: number; usd_24h_change: number };
  solana: { usd: number; usd_24h_change: number };
}

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchPrices() {
      try {
        const API_BASE = import.meta.env["VITE_API_URL"] || "http://localhost:3000";
        const API_KEY = import.meta.env["VITE_API_KEY"] || "changeme-key-1";

        const res = await fetch(`${API_BASE}/api/prices`, {
          headers: { "x-api-key": API_KEY }
        });
        if (!res.ok) throw new Error("Failed to fetch prices");
        const data = await res.json();
        if (isMounted) {
          setPrices(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Unknown error");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPrices();
    // Poll every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { prices, loading, error };
}
