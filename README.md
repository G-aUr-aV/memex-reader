# Memex Reader

A private, read-only browser interface for a Markdown vault, with responsive layouts, literal/phrase search, highlighted passages, wiki links, backlinks and a Markdown reader. No vault is included in this source repository.

## Run locally

Requires Node.js 24.18+ in the Node 24 line.

```sh
npm ci
npm run build
VAULT_PATH=/absolute/path/to/your/vault STATE_PATH=/absolute/private/reader-state PORT=4311 PUBLIC_ORIGIN=http://localhost:4311 npm start
```

Open http://localhost:4311. The server binds to loopback. Retrieve the generated initial login privately from the state directory and replace it after signing in. Keep credentials and mutable state outside both the repository and the vault.

For HTTPS forwarding, `PUBLIC_ORIGIN` must exactly match the reachable origin and its Host header. Origin, CSRF and secure-cookie checks remain enabled. Private content is not stored in browser local storage or an offline cache. The application never writes to the vault.

```sh
npm test
npm run test:sites
```

Browser tests use temporary invented vaults. See [API behavior](docs/api.md) and [design](docs/design.md). The frontend hosting scaffold is retained; the vault backend requires the separate Node service.
