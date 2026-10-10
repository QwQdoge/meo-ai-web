# Meo AI Web integration

This is a separate LibreChat fork. LibreChat supplies the responsive chat shell,
conversation renderer, and account session; Meo-specific behavior is isolated in
`meo/` plus small route and router registrations.

## Account ownership and login

- Meo Account is the only identity provider and encrypted BYOK authority.
- LibreChat uses its built-in OpenID Connect login with PKCE. Register the exact
  callback `${DOMAIN_SERVER}/oauth/openid/callback` in Meo Account.
- The browser uses the LibreChat same-origin session cookie. OIDC access tokens
  remain in the server-side session and are forwarded from the API adapter to
  Meo Account; provider API keys never enter the browser or LibreChat database.
- `MEO_ACCOUNT_OAUTH_CLIENT_ID` must equal `OPENID_CLIENT_ID`. The broker checks
  this client identity on every chat consent and invocation.

## Provider and chat flow

`/api/meo` reads enabled credential metadata and model metadata through
`ai-provider-broker`. Model-listing fallback lets a user enter a model ID by
hand. A chat turn first requests the broker's payload-bound consent preview;
the UI shows provider, model, purpose, data categories and destination before
invocation. The browser stores only the selected credential ID and the visible
conversation. It never receives an Account access token or provider key.

The current Account `invoke` contract buffers the provider result. The Meo route
streams the completed response to the chat view using SSE. It is an SSE transport
with a buffered upstream response; token-by-token provider streaming requires a
future Account broker streaming action and is not claimed by this adapter.

## Deep links and local history

`/new?connection=<credential-id>&model=<model-id>` selects an Account credential
and model after Meo Account login. Conversations are currently saved in
browser-local storage scoped to the authenticated LibreChat user. They survive a
reload on the same browser; cross-device history is a later migration to the
Meo Cloud conversation API.

## Local startup

Use Node 24+ and the package manager declared by the upstream repository. From
the fork root:

```sh
cp .env.example .env
cp meo/librechat.meo.example.yaml librechat.yaml
```

Set `MONGO_URI`, `DOMAIN_CLIENT=http://localhost:3080`,
`DOMAIN_SERVER=http://localhost:3080`, `OPENID_ISSUER`, `OPENID_CLIENT_ID`,
`OPENID_USE_PKCE=true`, `OPENID_REUSE_TOKENS=true`, `MEO_ACCOUNT_URL`, and
`MEO_ACCOUNT_OAUTH_CLIENT_ID` in `.env`. Leave `OPENID_CLIENT_SECRET` empty for
the registered public PKCE client. Register `http://localhost:3080/oauth/openid/callback`
for local development. Never put provider keys in `.env` or `librechat.yaml`.

Install and build the shared packages, then start MongoDB/Redis and both app
processes:

```sh
npm install
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package
npm run backend:dev
```

In a second terminal, run `npm run b:client:dev`, then open
`http://localhost:3080/new`. The route requires a working Meo Account OIDC
client and a signed-in Account with at least one enabled provider connection.

## AgentRun seam

The browser chat does not call local AgentService. The existing Meo Cloud client
remains the future entry point for AgentRun creation and replayable SSE at
`/v1/agent-runs/events`; reconnect must resume the same `run_id`. First-version
ordinary chat does not depend on AgentRun availability.
