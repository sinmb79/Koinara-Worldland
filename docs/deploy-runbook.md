# Deploy Runbook

## Inputs

- `config/chain.testnet.json` or `config/chain.mainnet.json`
- optional local override: `config/chain.testnet.local.json` or `config/chain.mainnet.local.json`
- `deploy/params.testnet.json` or `deploy/params.mainnet.json`
- `PRIVATE_KEY` in the shell environment

For local Anvil rehearsals, prefer a `.local.json` override or temporary `CHAIN_ID` / `RPC_URL`
environment variables instead of editing the tracked Worldland profiles.

## Commands

```bash
npm run doctor:testnet
forge build
npm run deploy:testnet
npm run verify:testnet
npm run canary:testnet
```

For mainnet, swap `testnet` with `mainnet`.

For the v2 path, use:

```bash
npm run doctor:mainnet
forge build
npm run deploy:v2:mainnet
npm run verify:v2:mainnet
DEPLOYMENT_VERSION=v2 npm run canary:v2:mainnet
```

If `forge` is unavailable on the current workstation, you can still run:

```bash
npm run doctor:testnet
```

to validate configuration readiness first. Actual deployment still needs the Foundry artifacts.

## Deployment Outputs

Successful deployments write:

- `deployments/worldland-testnet.json`
- `deployments/worldland-mainnet.json`
- `deployments/worldland-testnet-v2.json`
- `deployments/worldland-mainnet-v2.json`

Each manifest contains:

- `contractAddresses`
- `deployTxHashes`
- `blockNumbers`
- `chainId`
- `deployer`
- `rpcUrlUsed`
- `epochParams`
- `tokenCap`
- `gitRef`

## Canary Job

After deployment, you can create a minimal end-to-end canary job with:

```bash
npm run canary:testnet
```

This writes a `jobs/<requestHash>.json` manifest under the node discovery root and submits a
`Simple` job on-chain using the current deployment manifest.

For v2, the default canary root is:

- `.koinara-worldland-v2/network/`

## Contract Order

The deployment order matches the actual `koinara@v0.1.6` wiring:

1. `InferenceJobRegistry`
2. `ProofOfInferenceVerifier`
3. `KOINToken`
4. `RewardDistributor`
5. wire addresses and renounce admin privileges

That order follows the protocol reference implementation in [`vendor/koinara/script/Deploy.s.sol`](../vendor/koinara/script/Deploy.s.sol).

For v2, the deploy order becomes:

1. `InferenceJobRegistry`
2. `ProofOfInferenceVerifier`
3. `KOINToken`
4. `NodeRegistryV2`
5. `RewardDistributorV2`
6. wire addresses and renounce admin privileges
