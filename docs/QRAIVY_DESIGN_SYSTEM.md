# QRAIVY — Design System

> Not yet populated. Real color tokens, typography, and spacing rules exist
> somewhere in `frontend/public/css/` (`animations.css`, `canvas.css`,
> `editor.css`, `modal.css`, `panels.css`, `toolbar.css`, plus root-level
> `styles.css`, `sidebar.css`, `dashboard-shell.css`, `analytics-page.css`,
> `onboarding.css`, `manage-page.css`) — this doc should be filled in by
> extracting the actual values from those files rather than guessing.

## To populate this file

1. Identify the canonical color/spacing/typography source — likely
   `styles.css` and/or `dashboard-shell.css`, but confirm which file(s) define
   shared tokens vs. page-specific overrides
2. Extract CSS custom properties (`:root { --... }`) if they exist, or
   document the literal values in use if they don't
3. Note any inconsistency found between pages (e.g. if `editor.css` and
   `dashboard-shell.css` use different color values for the same purpose) —
   that's useful signal for the later frontend reorganization phase

## Components

Reusable UI patterns (buttons, modals, panels, toolbar elements) already
exist as separate CSS files (`modal.css`, `panels.css`, `toolbar.css`) —
document their actual class names and usage here once reviewed, rather than
inventing a component list.
