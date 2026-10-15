## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2026-10-15 - Concurrent Sanctions Checks in Graph Builder
**Learning:** In `apps/api/lib/domains/tracing/graphBuilder.ts`, the visualization payload generation had an N+1 query problem because it awaited `checkSanctioned(addr)` sequentially inside a nested loop over all paths.
**Action:** When building graph payloads or similar structures that require external checks per node, always collect unique entities first and resolve them concurrently via `Promise.all` before mapping them back to the nested loop structure.
