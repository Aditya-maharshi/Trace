import { NextResponse } from "next/server";

export const revalidate = 30; // cache for 30 seconds to respect rate limits

export async function GET() {
  const BINANCE_API_KEY = process.env.BINANCE_API_KEY || "";
  
  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]',
      {
        headers: {
          ...(BINANCE_API_KEY ? { "X-MBX-APIKEY": BINANCE_API_KEY } : {}),
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Binance API error: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Map Binance response to our expected format
    const formattedData = {
      bitcoin: { usd: 0, usd_24h_change: 0 },
      ethereum: { usd: 0, usd_24h_change: 0 },
      solana: { usd: 0, usd_24h_change: 0 },
    };

    for (const item of data) {
      if (item.symbol === "BTCUSDT") {
        formattedData.bitcoin.usd = parseFloat(item.lastPrice);
        formattedData.bitcoin.usd_24h_change = parseFloat(item.priceChangePercent);
      } else if (item.symbol === "ETHUSDT") {
        formattedData.ethereum.usd = parseFloat(item.lastPrice);
        formattedData.ethereum.usd_24h_change = parseFloat(item.priceChangePercent);
      } else if (item.symbol === "SOLUSDT") {
        formattedData.solana.usd = parseFloat(item.lastPrice);
        formattedData.solana.usd_24h_change = parseFloat(item.priceChangePercent);
      }
    }

    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error("Error fetching from Binance:", error);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
