## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2026-10-09 - Concurrent Fetches in buildGraphVisualizationPayload
**Learning:** Sequential await calls for checkSanctioned in a nested loop resulted in an N+1 fetching problem during graph visualization.
**Action:** Use a similar approach to attribution scores by extracting unique addresses and fetching them concurrently using Promise.all outside of the loop, thereby mitigating performance bottlenecks in graph building.
