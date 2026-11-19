# Node model catalog recovery

The LLM and TRANSLATE selectors use the model store's catalog snapshot. When its request is pending or fails, the inspector shows the store's loading or error state and offers a retry beside the selector.

Retry calls `modelStore.refreshStatus()` so a populated cached snapshot does not cause the `loadModels()` short circuit to skip the request. Repeated activation during a refresh is ignored while the retry control remains keyboard-focusable. A successful refresh returns focus to the selector when the retry button had focus.

Catalog errors do not change the node's configured provider or model. A successful empty catalog remains an empty result and does not show an error or retry. When the configured model has no matching catalog entry, the selector shows the current configuration as a read-only option rather than implying that no model was configured. An explicit provider without a model is also shown. If the matching entry returns, the selector displays it without editing the node. Legacy catalog entries with duplicate IDs remain individually selectable and display the saved provider and model pair. Use **Use service defaults** to clear the configured provider and model together, or pick a replacement from the catalog. This frontend display does not confirm that a configured model can run and does not change catalog requests, mock fallback, or execution.

The regression suite uses a mocked model catalog API and jsdom. A local browser preview checked the selector, error, and retry layout with an API adapter that returned empty responses and an injected 503 state; it did not call a live backend.
