# PRD-001: Chain Deployment via Arbitrum Chain SDK

**Status:** Approved
**Author:** Engineering
**Date:** 2026-02-27
**Parent:** [top-level-prd.md](top-level-prd.md)

## Problem Statement

Deploying a custom Arbitrum chain requires orchestrating rollup contract deployment on a parent chain, configuring validators and batch posters, and generating node configuration — all through the Chain SDK's TypeScript API.

## Goals

1. Deploy a new Arbitrum rollup chain on a parent chain (local Anvil or Sepolia)
2. Configure chain parameters (chainId, owner, DAC mode)
3. Set up batch poster and validator accounts
4. Generate node configuration for the deployed chain

## Functional Requirements

### FR-1: Chain Configuration

Prepare chain config using `prepareChainConfig`:

```typescript
import { prepareChainConfig } from '@arbitrum/orbit-sdk';

const chainConfig = prepareChainConfig({
  chainId: 97400766,
  arbitrum: {
    InitialChainOwner: deployer.address,
    DataAvailabilityCommittee: true,
  },
});
```

**Parameters:**
- `chainId`: Unique chain identifier (avoid collisions with known chains)
- `InitialChainOwner`: Address with admin control over the chain
- `DataAvailabilityCommittee`: `true` for AnyTrust (cheaper), `false` for full rollup

### FR-2: Rollup Creation

Deploy rollup contracts using `createRollup`:

```typescript
import { createRollup } from '@arbitrum/orbit-sdk';

const rollupResult = await createRollup({
  params: {
    config: chainConfig,
    batchPosters: [batchPoster.address],
    validators: [validator.address],
  },
  parentChainPublicClient,
  account: deployer,
});
```

**Outputs:**
- Core contract addresses (RollupProxy, Inbox, Outbox, Bridge, SequencerInbox)
- Transaction hash of deployment
- Chain deployment confirmation

### FR-3: Node Configuration

After deployment, generate node configuration:

```typescript
const nodeConfig = prepareNodeConfig({
  chainName: 'omega-messaging-chain',
  chainConfig,
  coreContracts: rollupResult.coreContracts,
  batchPosterPrivateKey: batchPosterKey,
  validatorPrivateKey: validatorKey,
  parentChainId: parentChain.id,
  parentChainRpcUrl: parentChainRpc,
});
```

**Config includes:**
- Parent chain connection details
- Core contract addresses
- Batch poster and validator key references
- Sequencer configuration
- Data availability settings

### FR-4: Post-Deployment Verification

After chain deployment:
1. Start the Arbitrum node with generated config
2. Verify block production via RPC
3. Confirm chain ID matches configuration
4. Verify batch poster is submitting to parent chain

## Non-Functional Requirements

- Deployment script must be idempotent (safe to re-run)
- All private keys loaded from environment variables, never hardcoded
- Deployment logs stored for audit trail
- Script should report clear errors if prerequisites are not met

## Technical Approach

1. TypeScript deployment script using `@arbitrum/orbit-sdk`
2. Viem for parent chain client interactions
3. Anvil as default parent chain (Sepolia as production testnet option)
4. Node config output as JSON file

## Dependencies

- `@arbitrum/orbit-sdk` — chain creation SDK
- `viem` — Ethereum client library
- Funded deployer account on parent chain
- Running parent chain (Anvil or Sepolia RPC)

## Acceptance Criteria

- [ ] `prepareChainConfig` produces valid config with specified chainId and owner
- [ ] `createRollup` transaction confirms on parent chain
- [ ] Core contract addresses returned and logged
- [ ] Node configuration file generated with correct parameters
- [ ] Chain node starts and produces blocks
- [ ] RPC endpoint responds to `eth_chainId` with configured chain ID
- [ ] Batch poster begins posting batches to parent chain

## Open Questions

1. AnyTrust vs full rollup — which mode for initial deployment?
2. Challenge period duration for testnet (shorter for faster testing?)
3. Sequencer batching interval configuration
