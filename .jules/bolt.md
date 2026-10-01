## 2026-09-30 - Remove redundant neighbor extraction loop
**Learning:** The BFS graph traversal routine (graphBuilder.ts) iterated over all transactions to construct a temporary Set for progress event metrics, right before extracting those exact same unique neighbors using the dedicated extractNormalizedNeighbors function. Duplicate Set iterations across thousands of potentially fetched transactions caused unnecessary memory allocations.
**Action:** Reordered calls to first extract the neighborMap, then used neighborMap.size directly for progress logging to remove O(N) redundant iteration.
