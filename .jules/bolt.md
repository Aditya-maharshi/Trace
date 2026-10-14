## 2024-10-14 - Prevent N+1 queries when building graph visualization
**Learning:** Found sequential `await checkSanctioned(addr)` network calls inside a double nested loop in `buildGraphVisualizationPayload` resulting in an N+1 performance bottleneck.
**Action:** When building graph nodes from a list of paths, aggregate all unique addresses into a Set upfront and resolve their data concurrently using `Promise.all` before mapping them into graph structures.
