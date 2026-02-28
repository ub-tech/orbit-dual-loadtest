import { defineChain } from 'viem';
import { foundry } from 'viem/chains';

/**
 * Custom Omega Messaging L2 chain deployed via Arbitrum Orbit.
 * RPC endpoints default to local node; override via environment variables.
 */
export const omegaMessagingChain = defineChain({
  id: 97400766,
  name: 'Omega Messaging Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['http://localhost:8449'],
      webSocket: ['ws://localhost:8449'],
    },
  },
  blockExplorers: undefined,
  testnet: true,
});

/**
 * Parent chain (L1) — Foundry/Anvil local devnet.
 */
export const parentChain = foundry;

/**
 * Messaging contract address on the L2 chain.
 * Set NEXT_PUBLIC_MESSAGING_CONTRACT after deployment.
 */
export const MESSAGING_CONTRACT_ADDRESS = (process.env
  .NEXT_PUBLIC_MESSAGING_CONTRACT ??
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
