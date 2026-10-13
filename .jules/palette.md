
## 2025-02-15 - Enhancing Icon-Only Action Buttons
**Learning:** Icon-only buttons (like refresh/logout) frequently miss critical accessibility context and state indications. The standard `disabled` attribute prevents interaction but needs accompanying styling (e.g., `disabled:opacity-50 disabled:cursor-not-allowed`) to visually communicate this state to the user.
**Action:** Always verify icon-only buttons have `aria-label`, `title`, and `aria-hidden="true"` on the icon itself. Ensure buttons loading data use the `disabled` attribute with clear visual indicators to prevent spam clicking.
