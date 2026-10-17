# Meo AI Web architecture

This repository currently contains two Web surfaces, but only one is the long-term product.

## Canonical Web application

The canonical Meo AI Web is the React/TypeScript application under `client/`.

`chat.meoarch.org` must ultimately serve this application. New user-facing Meo product work belongs in the React client and shared contracts, backed by Meo API.

Canonical product topology:

```text
Web (client/) ─────┐
Desktop ───────────┼──> meo-api / shared Meo AI contracts ──> Neon
Android ───────────┘
```

Meo API and Neon are the authoritative backend for account-owned AI state such as conversations, Projects, Project memory, compact context, Skills metadata, usage, devices/remote runtime metadata and persistent AI file metadata.

Do not create a second authoritative Web-only store or business-logic implementation.

## Legacy Pages UI

`meo-pages/public/*` is the legacy/static Pages UI that was used to bootstrap `chat.meoarch.org`.

It must not receive new Chat, Projects, Work, Skills, Memory, Agent or model-routing product logic. Those features belong in the canonical React client plus shared API/contracts.

During the cutover, the old static files may remain in the repository for rollback/history, but they are not the source of truth and should not be used as the Pages build output once the React cutover is active.

## Temporary browser edge

`meo-pages/functions/oauth/*` and the minimal same-origin Pages Functions may remain temporarily while browser OAuth/session handling is moved to Meo API or a dedicated thin `web-edge` layer.

The edge layer may handle browser-specific concerns such as:

- OAuth PKCE start/callback
- secure HttpOnly browser session/token cookies
- same-origin forwarding where needed

It must not own Meo AI business state or duplicate Chat/Projects/Skills/Work/Memory logic.

Target shape:

```text
React UI
  ├── /oauth/* -> temporary thin Pages auth edge
  └── /api/*   -> meo-api
```

Long term, either Meo API owns the browser auth/session flow directly or a very small `web-edge` remains. In both cases, product behavior stays in Meo API/shared contracts and the React UI.

## Cloudflare Pages cutover rule

The current Pages project may keep `/meo-pages` as its build root temporarily so existing Functions continue to work, but its static build output must come from `client/`.

The intended migration order is:

1. Build the React client and serve it on a preview deployment while keeping the existing OAuth Pages Functions.
2. Smoke-test login, callback/session restore, Chat shell and Meo API access.
3. Promote the same React build path to `chat.meoarch.org`.
4. Remove the legacy `meo-pages/public/app.js`, `core.js`, `index.html` and `style.css` after the production rollback window.
5. Move OAuth/session handling into Meo API or a dedicated thin `web-edge`, then remove the remaining legacy Pages structure.

Do not add new product features to `meo-pages/public` while this migration is in progress.
