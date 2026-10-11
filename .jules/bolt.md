## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2024-05-18 - N+1 Issue in Nested Tracing Loops
**Learning:** Sequential network/database calls within nested `for` loops in tracing functionality (like graph building) are a major performance bottleneck for deep paths. The latency adds up drastically per node (N+1 query problem).
**Action:** Always extract unique identifiers (e.g., wallet addresses) upfront using a `Set`. Use `Promise.all` to fetch data concurrently for the unique set into a `Map`, and then replace the sequential loop logic with O(1) map lookups.
