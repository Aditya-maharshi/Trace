## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2026-10-08 - Optimized sequential checkSanctioned calls to concurrent fetching in graphBuilder
**Learning:** Found an N+1 query problem during tracing graph building where `checkSanctioned` was repeatedly awaited in a nested loop for every hop in the attribution paths.
**Action:** When processing paths or multiple node entities for metadata like sanctions or ENS, aggregate the addresses into a unique `Set` first, then resolve them concurrently via `Promise.all` before executing nested loops that rely on them.
