# Deploy Runbook

## Inputs

- `config/chain.testnet.json` or `config/chain.mainnet.json`
- `deploy/params.testnet.json` or `deploy/params.mainnet.json`
- `PRIVATE_KEY` in the shell environment

## Commands

```bash
forge build
npm run deploy:testnet
npm run verify:testnet
```

For mainnet, swap `testnet` with `mainnet`.

## Deployment Outputs

Successful deployments write:

- `deployments/worldland-testnet.json`
- `deployments/worldland-mainnet.json`

Each manifest contains:

- `contractAddresses`
- `deployTxHashes`
- `blockNumbers`
- `chainId`
- `epochParams`
- `tokenCap`
- `gitRef`

## Contract Order

The deployment order matches the actual `koinara@v0.1.6` wiring:

1. `InferenceJobRegistry`
2. `ProofOfInferenceVerifier`
3. `KOINToken`
4. `RewardDistributor`
5. wire addresses and renounce admin privileges

That order follows the protocol reference implementation in [`vendor/koinara/script/Deploy.s.sol`](../vendor/koinara/script/Deploy.s.sol).
