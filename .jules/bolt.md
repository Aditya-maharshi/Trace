## 2026-10-02 - Batched graph fetch
**Learning:** Found sequential I/O bottleneck in `aggregateAttributions` (O(paths * depth)) when fetching transactions for each address in the resulting graph paths.
**Action:** When working with graph paths, always gather unique nodes and batch network calls using `Promise.all` instead of evaluating in nested loops.
