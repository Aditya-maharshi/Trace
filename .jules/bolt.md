## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2025-02-12 - Concurrent Fetches in Risk Classification loops
**Learning:** Sequential `await` calls inside nested loops (like `await checkSanctioned(addr)` within graph building or risk classification) lead to N+1 query bottlenecks, drastically slowing down trace rendering for deep graphs.
**Action:** Always extract unique identifiers (like addresses) upfront and fetch external or cache data concurrently using `Promise.all` before executing nested path or graph traversal loops.
