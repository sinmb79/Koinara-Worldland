# Final Operator Steps

The repository is designed so that the final human-only tasks are limited to secrets, funding, and the irreversible mainnet action.

## What the Operator Must Still Do

1. Fill the real Worldland values in:
   - `config/chain.testnet.json`
   - `config/chain.mainnet.json`
2. Provide the deployer key by one of these methods:
   - `PRIVATE_KEY`
   - `PRIVATE_KEY_FILE`
3. Provide each node wallet by one of these methods:
   - `WALLET_PRIVATE_KEY`
   - `WALLET_KEYFILE`
4. Fund the deployer and node wallets with the native asset needed for gas.
5. If using the OpenAI backend, set `OPENAI_API_KEY`.
6. Approve the actual mainnet broadcast after Anvil, testnet, and fork rehearsals pass.

## Commands to Run Before Mainnet

```bash
npm run doctor:testnet
npm run node:doctor
npm run deploy:testnet
npm run verify:testnet
```

Then repeat the same pattern for mainnet rehearsal and final broadcast.

## What This Repo Already Covers

- Deployment manifests
- Contract wiring verification
- Public node setup wizard
- Provider and verifier runtime
- Off-chain manifest and receipt spec
- Local canary manifest generation
