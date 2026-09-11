import { NextResponse } from "next/server";

export const revalidate = 30; // cache for 30 seconds to respect rate limits

// In-memory cache for fallback if external APIs are temporarily rate-limited
let lastKnownPrices = {
  bitcoin: { usd: 77200, usd_24h_change: -1.1 },
  ethereum: { usd: 2465, usd_24h_change: -0.2 },
  solana: { usd: 99.5, usd_24h_change: -1.5 },
};

export async function GET() {
  const BINANCE_API_KEY = process.env.BINANCE_API_KEY || "";
  const encodedSymbols = encodeURIComponent('["BTCUSDT","ETHUSDT","SOLUSDT"]');

  // 1. Try global Binance API
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodedSymbols}`,
      {
        headers: {
          ...(BINANCE_API_KEY ? { "X-MBX-APIKEY": BINANCE_API_KEY } : {}),
        },
        next: { revalidate: 30 },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const formattedData = parseBinanceResponse(data);
      if (formattedData) {
        lastKnownPrices = formattedData;
        return NextResponse.json(formattedData);
      }
    }
  } catch (err) {
    console.warn("Global Binance API failed, trying Binance US fallback:", err);
  }

  // 2. Fallback to Binance US (handles US Vercel edge/serverless regions like iad1)
  try {
    const res = await fetch(
      `https://api.binance.us/api/v3/ticker/24hr?symbols=${encodedSymbols}`,
      { next: { revalidate: 30 } }
    );

    if (res.ok) {
      const data = await res.json();
      const formattedData = parseBinanceResponse(data);
      if (formattedData) {
        lastKnownPrices = formattedData;
        return NextResponse.json(formattedData);
      }
    }
  } catch (err) {
    console.warn("Binance US API failed, trying CoinGecko fallback:", err);
  }

  // 3. Fallback to CoinGecko
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
      { next: { revalidate: 30 } }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.bitcoin && data.ethereum && data.solana) {
        const formattedData = {
          bitcoin: {
            usd: data.bitcoin.usd || lastKnownPrices.bitcoin.usd,
            usd_24h_change: data.bitcoin.usd_24h_change || 0,
          },
          ethereum: {
            usd: data.ethereum.usd || lastKnownPrices.ethereum.usd,
            usd_24h_change: data.ethereum.usd_24h_change || 0,
          },
          solana: {
            usd: data.solana.usd || lastKnownPrices.solana.usd,
            usd_24h_change: data.solana.usd_24h_change || 0,
          },
        };
        lastKnownPrices = formattedData;
        return NextResponse.json(formattedData);
      }
    }
  } catch (err) {
    console.warn("CoinGecko API fallback failed:", err);
  }

  // 4. Return last known prices if all external APIs fail (prevents UI breakages)
  return NextResponse.json(lastKnownPrices);
}

function parseBinanceResponse(data: any[]): typeof lastKnownPrices | null {
  if (!Array.isArray(data)) return null;

  const result = {
    bitcoin: { usd: 0, usd_24h_change: 0 },
    ethereum: { usd: 0, usd_24h_change: 0 },
    solana: { usd: 0, usd_24h_change: 0 },
  };

  for (const item of data) {
    if (item.symbol === "BTCUSDT") {
      result.bitcoin.usd = parseFloat(item.lastPrice) || 0;
      result.bitcoin.usd_24h_change = parseFloat(item.priceChangePercent) || 0;
    } else if (item.symbol === "ETHUSDT") {
      result.ethereum.usd = parseFloat(item.lastPrice) || 0;
      result.ethereum.usd_24h_change = parseFloat(item.priceChangePercent) || 0;
    } else if (item.symbol === "SOLUSDT") {
      result.solana.usd = parseFloat(item.lastPrice) || 0;
      result.solana.usd_24h_change = parseFloat(item.priceChangePercent) || 0;
    }
  }

  return result.bitcoin.usd > 0 ? result : null;
}
