## Bolt Journal
## 2023-10-24 - React DnD Optimizations
**Learning:** During DnD operations, list state updates can trigger expensive re-renders across all items and columns in a board if they are not memoized.
**Action:** Wrap individual draggable cards (`CaseCard`) and droppable containers (`DroppableColumn`) in `React.memo` to prevent unnecessary re-renders when their props have not fundamentally changed.
