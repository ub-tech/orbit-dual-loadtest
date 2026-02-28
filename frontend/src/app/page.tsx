'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { SendMessage } from '@/components/SendMessage';
import { MessageList } from '@/components/MessageList';
import { BridgeStatus } from '@/components/BridgeStatus';

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      {/* Header */}
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Omega Messaging</h1>
          <p className="mt-1 text-sm text-gray-400">
            Cross-chain messaging on Arbitrum Orbit + Stylus
          </p>
        </div>
        <ConnectButton />
      </header>

      {isConnected ? (
        <div className="space-y-8">
          {/* Send a new message */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-gray-200">
              Send Message
            </h2>
            <SendMessage />
          </section>

          {/* Message list */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-gray-200">
              Messages
            </h2>
            <MessageList />
          </section>

          {/* Bridge status */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-gray-200">
              Bridge Activity
            </h2>
            <BridgeStatus />
          </section>
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-200">
            Connect Your Wallet
          </h2>
          <p className="mb-6 text-gray-400">
            Connect a wallet to send messages and bridge them cross-chain.
          </p>
          <ConnectButton />
        </div>
      )}
    </main>
  );
}
