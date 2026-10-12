## 2023-10-24 - Accessibility improvements for icon-only buttons
**Learning:** Found an icon-only sign-out button (`<LogOut />`) in `GovernmentDashboardPage` without an accessible name. This is a common pattern that makes navigation difficult for screen reader users.
**Action:** Always add `aria-label` for screen readers and `title` for sighted users when encountering icon-only buttons.
