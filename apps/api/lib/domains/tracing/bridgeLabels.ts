/**
 * lib/bridgeLabels.ts
 *
 * Registry of well-known cross-chain bridge contracts on Ethereum mainnet.
 * Keys are lowercased Ethereum addresses; values are human-readable labels.
 *
 * Sources: Public official documentation of bridge protocols and Etherscan
 * verified-contract tags (Arbitrum, Optimism, Base, Polygon, Avalanche,
 * Across, Hop, Stargate, Wormhole, Synapse, Ronin).
 */

export const BRIDGE_LABELS: Record<string, string> = {
  // Arbitrum
  "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": "Arbitrum One: Inbox",
  "0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a": "Arbitrum: Bridge",
  "0xcee284f754e854890e311e3280b767f80797180d": "Arbitrum: L1 Custom Gateway",
  "0x0b9857ae2dae6031a61b66397deb858575289374": "Arbitrum: Outbox",

  // Optimism
  "0x25ace71c97b33cc4729cf772ae268934f7ab5fa1": "Optimism: L1CrossDomainMessenger",
  "0xbeb5fc579115071764c7423a4f12edde41f104ed": "Optimism: Portal",
  "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1": "Optimism: L1StandardBridge",

  // Base
  "0x49048044d57e1c92a77f79988d21fa8faf74e97e": "Base: Portal",
  "0x3154cf16ccdb4c6d922629664174b904d80f2c35": "Base: L1StandardBridge",
  "0x866e82a600a1414e583f7f13623f1ac5d58b0afa": "Base: L1CrossDomainMessenger",

  // Polygon (PoS & zkEVM)
  "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf": "Polygon: PoS ERC20 Bridge",
  "0xa0c68c638235ee3e04337270a06309af81743db0": "Polygon: RootChainManager",
  "0x401f6c9838a5074465fe82902345517173e13d1a": "Polygon: Plasma Bridge",
  "0x2a3dd3eb832af982ec71669e178424b10dca2ede": "Polygon zkEVM: Bridge",

  // Avalanche
  "0x8eb8a3b98659cce290402893d0123abb75e3ab28": "Avalanche: Bridge",

  // Across Protocol
  "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5": "Across: SpokePool V2",
  "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64": "Across: SpokePool V3",

  // Hop Protocol
  "0x3666f603cc164936c1b87e207f36beba4ac5f18a": "Hop: USDC Bridge",
  "0xb8901acb112dd022097238809937168712c571cc": "Hop: ETH Bridge",
  "0x3e4a3a4796d16c0cd582c382691998f7c06420b6": "Hop: USDT Bridge",
  "0x3d4cc8a61c7528fd86c55acf061a783751664d61": "Hop: DAI Bridge",

  // Stargate
  "0x296f55f0fb284e00226922874a557550157efb9e": "Stargate: Bridge V1",
  "0x8731d54e9d02c215207d56303606636374499456": "Stargate: Router V1",
  "0xd823c605807cc5e6bd6fc0d7e4eea50d3e16ce6a": "Stargate: Router V2",

  // Wormhole
  "0x3ee18b2214aff97000d974cf647e7c347e8fa585": "Wormhole: Portal Token Bridge",
  "0x98f3c9e6e3face36ba8cee1aa041400994f52510": "Wormhole: Core Bridge",

  // Synapse
  "0x2796317b0ff8538f253012862c06787adfb8ceb6": "Synapse: Bridge",

  // Ronin
  "0x1a2a1c938ce3fc391a7599f8666ae462c9579541": "Ronin: Gateway V2",
  "0x64192819ac13ef72bf6b5ae239ac672b43a9af08": "Ronin: Bridge",
};

/**
 * Build a Set<string> of all known bridge addresses (lowercased).
 */
export function buildBridgeSet(): Set<string> {
  return new Set(Object.keys(BRIDGE_LABELS).map((a) => a.toLowerCase()));
}

/**
 * Given an address, return its bridge label if known, or undefined.
 */
export function labelForBridge(address: string): string | undefined {
  return BRIDGE_LABELS[address.toLowerCase()];
}

/**
 * Check if an address is a known cross-chain bridge contract.
 */
export function isBridge(address: string): boolean {
  return address.toLowerCase() in BRIDGE_LABELS;
}
