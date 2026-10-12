# Meo AI Web

**Meo AI Web is the browser surface of Meo AI: one place for conversations, models and agent workflows that stays aligned with the Meo desktop experience.**

> Development preview. This repository preserves LibreChat upstream history and architecture while Meo-specific branding, account integration and product UX are applied as a deliberately small patch surface.

## Product role

Meo AI Web is the browser frontend/deployment repository. The broader Meo AI product contract lives in **[QwQdoge/meo-ai](https://github.com/QwQdoge/meo-ai)**.

```text
Browser
  │
  ├─ Meo AI Web (this repository)
  │    ├─ conversation + agent UX
  │    ├─ responsive web shell
  │    └─ Meo branding / product integration
  │
  ├─ Meo Account
  │    └─ identity, session and encrypted BYOK authority
  │
  └─ Meo AI service/cloud contracts
       └─ conversations, AgentRuns and device hand-off
```

The web fork should remain easy to rebase against LibreChat. Product-specific behavior should therefore be narrow, documented and based on existing shared frontend primitives rather than broad rewrites of upstream UI.

## Experience contract

Meo AI Web should feel like the same product as the native Meo client, not a separately themed LibreChat deployment.

- **Clear first use:** useful empty states and example prompts instead of an unexplained blank canvas.
- **Explicit runtime state:** streaming, stop/cancel, retry, reconnect, offline and restored-session states are visible and actionable.
- **Low interaction cost:** keyboard-first chat, search and model switching; common actions stay close to the conversation.
- **User control:** model/provider, connectivity and data boundaries should be understandable without opening developer tools.
- **Accessible by default:** semantic HTML, visible keyboard focus, ARIA labels, reduced-motion support and light/dark/high-contrast compatibility.
- **Meo visual language:** reuse semantic theme roles and shared primitives; avoid hard-coded feature-local palettes.

## Development

This fork follows the inherited LibreChat repository workflow. Ordinary work is based on **`dev`**; `main` is the released branch and is synchronized from `dev` rather than used as the normal development target.

Install dependencies and use the repository's existing workspace scripts:

```sh
npm ci
```

For frontend changes, run focused tests for the affected component, TypeScript checks in the changed workspace and the repository's scoped static checks. Startup/auth/config/file/message-loading work should also pass the Lighthouse budget documented under `e2e/lighthouse/`.

Read **[`AGENTS.md`](AGENTS.md)** before changing code; it is the authoritative contributor and validation guide for this fork.

## Branding and theming

Meo's reusable visual source of truth is **MeoUI / the Meo design-token contract**, not one-off colors copied into web features. Where the web stack cannot consume QML tokens directly, keep the mapping semantic and versioned so the same roles — surfaces, text, accent, shape, spacing and motion intent — can be kept aligned across platforms.

The web shell must support system/light/dark appearance, high contrast and reduced motion. New reusable design needs should deepen shared primitives or the theme-token registry instead of creating another local component dialect.

## Privacy and trust

Meo Account remains the authority for authentication/session identity and encrypted provider credentials. The web client must not become a second credential authority or expose raw provider secrets to unrelated client code.

Product work should prefer explicit network/data explanations, user-controlled account/API choices and clear failure messages over opaque telemetry or generic "something went wrong" states.

## Upstream

This repository is derived from **[LibreChat](https://github.com/danny-avila/LibreChat)**. LibreChat provides the large upstream web application and agent/chat capability base; its licenses, notices and provenance remain part of this repository.

Meo-specific patches should stay intentionally small so upstream security, reliability and feature improvements can continue to flow into the fork.
