# Frontend dark-theme contrast contracts

This patch keeps two semantic color contracts explicit:

- The neutral **Stay here** action in the unsaved-workflow dialog uses `text-text-primary`, so it remains visible when the dialog surface is remapped by the dark theme.
- Read notification cards use `bg-app-bg2`, which has an existing dark-theme override. Opacity-qualified light utilities such as `bg-app-bg2/70` must not be used for this surface unless they receive a matching dark override.

The related contract test also preserves the existing save, discard, stay, unread-dot, status-dot, and read/unread branches. Validation is limited to source contracts, related interaction tests, typecheck, and production build; no browser visual acceptance was performed.
