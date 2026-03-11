# Koinara-Worldland

`Koinara-Worldland` is the deployment and node software repository for running `Koinara` on Worldland.

This repository does not modify the protocol. The protocol source is vendored as a read-only git submodule at `vendor/koinara`, pinned to [`sinmb79/koinara@v0.1.6`](https://github.com/sinmb79/koinara/releases/tag/v0.1.6).

## Scope

- Deploy and verify the `Koinara` protocol contracts on Worldland.
- Provide a node program that anyone can run as a provider, a verifier, or both.
- Define the off-chain manifest and receipt rules needed for public nodes to interoperate with the on-chain hash-only protocol.

## Repository Layout

- `vendor/koinara/`: protocol source, read-only submodule at `v0.1.6`
- `deploy/`: deployment, verification, and local E2E helpers
- `node/`: provider and verifier node program
- `config/`: chain profiles
- `deployments/`: generated deployment manifests
- `docs/`: deployment runbook, node setup guide, and network spec

## Quick Start

1. Install Node.js 20+ and Foundry.
2. Initialize the submodule:

```bash
git submodule update --init --recursive
```

3. Install workspace dependencies:

```bash
npm install
```

You can check how close the repository is to deployment readiness with:

```bash
npm run doctor:testnet
```

4. Compile the protocol contracts with Foundry:

```bash
forge build
```

If `forge` is blocked on the current machine, you can still use the TypeScript-side checks and prepare configs first. Deployment itself still requires built artifacts.

5. Generate local node configuration:

```bash
npm run setup
```

After setup, you can validate the node-side configuration with:

```bash
npm run node:doctor
```

6. Start the node:

```bash
npm run node
```

For a single non-daemon pass:

```bash
npm run node:once
```

## Deployment Flow

- `npm run deploy:testnet`
- `npm run verify:testnet`
- `npm run deploy:mainnet`
- `npm run verify:mainnet`

The required rehearsal sequence is documented in [docs/mainnet-checklist.md](docs/mainnet-checklist.md).

## Network Interop

The protocol stores only hashes on-chain. Public nodes therefore rely on an off-chain companion format to discover job payloads and provider outputs.

- Job discovery: `jobs/<requestHash>.json`
- Submission discovery: `receipts/<jobId>-<responseHash>.json`

The full format is documented in [docs/network-spec.md](docs/network-spec.md).

## Final Human-Only Steps

The last operator-only tasks are documented in [docs/final-operator-steps.md](docs/final-operator-steps.md).
