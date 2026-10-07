## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2026-10-07 - Concurrent Fetches in graph visualization loop
**Learning:** The nested `for` loop in `buildGraphVisualizationPayload` of `apps/api/lib/domains/tracing/graphBuilder.ts` did a sequential N+1 `await` fetching for each transaction hop's sanction status, potentially leading to slow rendering.
**Action:** Always try to extract variables and `Promise.all` them concurrently outside of inner loops for network fetching.
