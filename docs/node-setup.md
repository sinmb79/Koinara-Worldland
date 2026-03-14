# Node Setup

## Prerequisites

- Node.js 20+
- A funded Worldland wallet
- Access to a manifest root and a receipt root
- One inference backend:
  - Ollama for local inference
  - OpenAI for hosted inference

## Setup

```bash
npm install
npm run setup
```

The setup wizard creates:

- `node/node.config.json`
- `node/.env.local`

Prefer a key file instead of pasting raw secrets into `.env.local`. If you leave the wallet blank
during setup, fill one of these later:

- `WALLET_KEYFILE`
- `WALLET_PRIVATE_KEY` (legacy/unsafe)

## Start the Node

```bash
npm run node:doctor
npm run node
```

The role comes from `NODE_ROLE=provider|verifier|both`.

## Verify Participation

- Provider:
  - watch for `submitResponse` transactions from your wallet
- Verifier:
  - watch for `verifySubmission` or `rejectSubmission` from your wallet
- Both:
  - watch the job state move to `Settled`
  - confirm KOIN appears in your wallet

## Shared Manifest Roots

If your provider and verifier run on different machines, point them to a shared discovery root.
The node uses the hash-addressed rules from [docs/network-spec.md](./network-spec.md).
