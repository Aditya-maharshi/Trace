## 2024-10-01 - Avoid array allocations in count filters
**Learning:** `Array.filter(...).length` causes an intermediate array allocation which hurts performance inside React `useMemo` hooks running on thousands of elements. `Date.parse()` is faster than `new Date()`.
**Action:** Replace `Array.filter().length` with standard `for` loops summing up a counter and use `Date.parse()` when only comparing timestamps.
