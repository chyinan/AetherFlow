# Node model catalog recovery

The LLM and TRANSLATE selectors use the model store's catalog snapshot. When its request is pending or fails, the inspector shows the store's loading or error state and offers a retry beside the selector.

Retry calls `modelStore.refreshStatus()` so a populated cached snapshot does not cause the `loadModels()` short circuit to skip the request. Repeated activation during a refresh is ignored while the retry control remains keyboard-focusable. A successful refresh returns focus to the selector when the retry button had focus.

Catalog errors do not change the node's configured provider or model. A successful empty catalog remains an empty result and does not show an error or retry. This is a frontend-only recovery path; API behavior, mock fallback, and partial successful responses are unchanged.

The regression suite uses a mocked model catalog API and jsdom. A local browser preview checked the selector, error, and retry layout with an API adapter that returned empty responses and an injected 503 state; it did not call a live backend.
