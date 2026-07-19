# Relay console

The console is a credential-free, read-only projection of a generated Relay state snapshot. It shows derived task state, transition history counts, and default-policy gate results. It is intentionally compatible with static hosting such as GitHub Pages.

Run it locally from the repository root:

```bash
npm run build:state
npm run console
```

Then open `http://127.0.0.1:4173`.

The console must never call model-provider APIs or embed tokens. Future write controls will redirect into an authenticated GitHub or Relay service flow rather than pretending a static site can keep a secret.
