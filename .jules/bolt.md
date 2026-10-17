## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2025-02-12 - Concurrent fetches in buildGraphVisualizationPayload
**Learning:** `buildGraphVisualizationPayload` in `apps/api/lib/domains/tracing/graphBuilder.ts` sequentially invoked `await checkSanctioned(addr)` inside a nested loop for every hop in the path. This led to an N+1 fetching problem which became extremely slow on large BFS graphs.
**Action:** Always extract unique entities, perform concurrent fetches via `Promise.all` into a `Map` structure, and then query the map in subsequent synchronous/nested loops instead of awaiting within them.
