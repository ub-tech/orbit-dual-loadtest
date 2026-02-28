import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { omegaMessagingChain, parentChain } from './chains';

/**
 * Wagmi + RainbowKit configuration.
 *
 * Both the L2 (Omega Messaging Chain) and L1 (Foundry/Anvil) are registered
 * so the wallet can switch between them for bridging operations.
 */
export const config = getDefaultConfig({
  appName: 'Omega Messaging',
  projectId: 'omega-messaging-local', // WalletConnect project ID (placeholder for local dev)
  chains: [omegaMessagingChain, parentChain],
  ssr: true,
});
