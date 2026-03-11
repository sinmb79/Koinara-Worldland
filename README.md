# Koinara-Worldland

`Koinara-Worldland` is the deployment and node software repository for running `Koinara` on Worldland.

This repository does not modify the protocol. The protocol source is vendored as a read-only git submodule at `vendor/koinara`, pinned to [`sinmb79/koinara@v0.1.6`](https://github.com/sinmb79/koinara/releases/tag/v0.1.6) for the v1 line while carrying the parallel Worldland v2 deployment path.

## Scope

- Deploy and verify the `Koinara` protocol contracts on Worldland.
- Provide a node program that anyone can run as a provider, a verifier, or both.
- Define the off-chain manifest and receipt rules needed for public nodes to interoperate with the on-chain hash-only protocol.
- Maintain both the legacy v1 path and the live Worldland v2 path.

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
- `npm run deploy:v2:testnet`
- `npm run verify:v2:testnet`
- `npm run deploy:v2:mainnet`
- `npm run verify:v2:mainnet`
- `npm run canary:v2:mainnet`

The required rehearsal sequence is documented in [docs/mainnet-checklist.md](docs/mainnet-checklist.md).

## Live Worldland v2 Deployment

Worldland v2 is live on mainnet.

- `registry`: `0x865315BE82c432A45BB68C959413026F6202e368`
- `verifier`: `0x3b63deb3632b2484bAb6069281f08642ab112b16`
- `token`: `0x7749473E36a8d6E741d9E581106E81CacAb7832a`
- `nodeRegistry`: `0x243fB879fBE521c5c227Da9EF731968413755131`
- `rewardDistributor`: `0x6Db94C2c93af7b0B5345C66535D5dC7cD9225126`

The generated manifest is:

- `deployments/worldland-mainnet-v2.json`

## Network Interop

The protocol stores only hashes on-chain. Public nodes therefore rely on an off-chain companion format to discover job payloads and provider outputs.

- Job discovery: `jobs/<requestHash>.json`
- Submission discovery: `receipts/<jobId>-<responseHash>.json`

The full format is documented in [docs/network-spec.md](docs/network-spec.md).

## Final Human-Only Steps

The last operator-only tasks are documented in [docs/final-operator-steps.md](docs/final-operator-steps.md).
