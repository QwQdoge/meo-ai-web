# Meo AI Web integration

This fork keeps LibreChat as the web chat implementation and adds only the integration required for the Meo AI product.

## Product boundary

- LibreChat owns the generic web chat UI, message rendering, attachments, model-selection surfaces and generic agent/MCP UI.
- `QwQdoge/meo-ai` owns Meo AI cloud/device contracts, AgentRun semantics, the native MeoUI client and the local AgentService.
- Meo Account remains the identity and provider-credential authority. This repository must never persist raw Meo Account provider API keys.

## Authentication

LibreChat already supports generic OpenID Connect and PKCE. Meo Account uses the Supabase Auth OAuth 2.1/OIDC server, so the first integration should use LibreChat's existing OpenID path rather than adding another authentication implementation.

Required deployment configuration is documented in `meo/meo.env.example`.

The Meo AI Web OAuth client must be registered in Meo Account with an exact redirect URI matching `${DOMAIN_SERVER}/oauth/openid/callback`. Public-client PKCE is preferred; do not ship a client secret to browser code.

## AI provider calls

Do not copy provider keys from Meo Account into LibreChat's database or environment. The target integration is a Meo-owned backend endpoint that authenticates the current Meo Account session and forwards inference through the Account-owned provider broker.

The currently deployed Account broker uses one-time payload-bound consent for each inference. That contract is appropriate for isolated Settings actions but too disruptive for ordinary chat. Before making the web frontend depend on it, add a scoped, revocable first-party chat grant in the Meo AI/Account contract. Do not silently bypass the current consent check.

## Upstream maintenance

Keep `upstream` pointing to `LibreChat-AI/LibreChat`. Prefer small Meo-specific adapters/configuration over broad edits so upstream merges remain practical.

Never remove the upstream MIT license or notices.
