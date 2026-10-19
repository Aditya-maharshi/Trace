## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.

## 2025-02-12 - Concurrent API Calls in Node Processing
**Learning:** In tracing domains where path lists are generated, subsequent operations that enhance node data (such as sanctions checks in `graphBuilder.ts`) must avoid `await` in nested loops over paths and nodes. This sequential processing causes severe network bottlenecks.
**Action:** Extract unique nodes using `Set`, use `Promise.all` for parallel resolution, and store results in a `Map` before iterating over paths for node enhancement.
