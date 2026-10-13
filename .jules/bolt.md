## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.
## 2025-02-12 - Concurrent Fetches in attribution score loop
**Learning:** The nested `for` loop in `aggregateAttributions` of `apps/api/lib/domains/tracing/attribution.ts` did a sequential N+1 `await` fetching for each transaction hop, potentially leading to slow scoring. This codebase pattern should aggregate unique addresses and `Promise.all` the fetch array.
**Action:** When finding a performance bottleneck related to loops involving network fetching (like blockchain data via Etherscan/Blockscout adapters), always try to extract variables and `Promise.all` them concurrently outside of inner loops.

## 2025-02-12 - Concurrent Sanctions Checking
**Learning:** The `buildGraphVisualizationPayload` function in `apps/api/lib/domains/tracing/graphBuilder.ts` made sequential `await checkSanctioned(addr)` network calls inside a nested `for` loop, causing an N+1 fetching problem identical to a previously identified pattern in attribution scoring. Deduplicating addresses and resolving them concurrently dramatically improves performance without risking rate-limits due to the built-in concurrency limiter in `sanctions.ts`.
**Action:** Continue to actively seek out and refactor sequential array processing involving I/O by extracting unique entities and using `Promise.all` to fetch them in parallel upfront.
