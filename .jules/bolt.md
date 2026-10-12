## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2026-10-12 - Graph Sanctions Concurrent Fetching
**Learning:** The `buildGraphVisualizationPayload` function was making sequential `checkSanctioned` calls inside nested loops, causing N+1 latency. Extracting unique addresses using a `Set` and making concurrent calls with `Promise.all` is vastly faster for graph traversal payloads.
**Action:** Always inspect nested loops over BFS path results. Gather unique addresses first and fetch required metadata concurrently before iterating.
