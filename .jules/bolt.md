## 2026-10-18 - Optimized Graph Building Sequential Sanctions Check
**Learning:** Found a nested loop executing sequential `await checkSanctioned(addr)` network/cache calls for every address in a graph rendering function. This creates an N+1 query problem that balloons latency linearly as path depth increases.
**Action:** When extracting data across deeply nested graph nodes, always aggregate unique identities into a `Set` upfront and batch external IO using `Promise.all` into a pre-populated lookup map before iterating over the data structure.
