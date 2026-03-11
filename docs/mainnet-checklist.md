# Mainnet Checklist

Mainnet deployment is allowed only after all earlier phases succeed.

## Phase 0: Local Anvil

1. Run `forge build`
2. Start `anvil`
3. Run `npm run deploy:testnet` against the local RPC override
4. Generate a canary manifest with `npm run e2e`
5. Start one provider node and one verifier node
6. Confirm the canary `Simple` job reaches `Settled`

## Phase 1: Worldland Testnet

1. Fill `config/chain.testnet.json`
2. Deploy with `npm run deploy:testnet`
3. Verify with `npm run verify:testnet`
4. Run one canary `Simple` job to `Settled`
5. Confirm KOIN reaches the provider and verifier wallets

## Phase 2: Worldland Mainnet Fork

1. Point `config/chain.mainnet.json` at a mainnet fork RPC
2. Deploy with `npm run deploy:mainnet`
3. Verify with `npm run verify:mainnet`
4. Run the same canary flow end to end

## Phase 3: Worldland Mainnet Broadcast

1. Replace the fork RPC with the real mainnet RPC
2. Deploy with `npm run deploy:mainnet`
3. Verify with `npm run verify:mainnet`
4. Run one final canary `Simple` job
5. Open the node network to broader participation only after the canary settles
