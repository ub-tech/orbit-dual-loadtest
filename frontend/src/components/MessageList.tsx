'use client';

import { useReadContract, useReadContracts, useWriteContract } from 'wagmi';
import { messagingContractAbi } from '@/abi/MessagingContract';
import {
  MESSAGING_CONTRACT_ADDRESS,
  omegaMessagingChain,
} from '@/config/chains';

/**
 * Displays all messages stored in the Stylus contract.
 *
 * 1. Reads `message_count` to know how many messages exist.
 * 2. Multicalls `get_message` and `get_sender` for each ID.
 * 3. Renders a list with a "Bridge" button per message.
 */
export function MessageList() {
  // Step 1 — total message count
  const {
    data: countRaw,
    isLoading: isCountLoading,
    error: countError,
  } = useReadContract({
    address: MESSAGING_CONTRACT_ADDRESS,
    abi: messagingContractAbi,
    functionName: 'messageCount',
    chainId: omegaMessagingChain.id,
    query: {
      refetchInterval: 5_000, // auto-refresh every 5 s
    },
  });

  const count = countRaw !== undefined ? Number(countRaw) : 0;

  // Step 2 — batch read messages + senders
  const messageContracts = Array.from({ length: count }, (_, i) => ({
    address: MESSAGING_CONTRACT_ADDRESS,
    abi: messagingContractAbi,
    functionName: 'getMessage' as const,
    args: [BigInt(i)] as const,
    chainId: omegaMessagingChain.id,
  }));

  const senderContracts = Array.from({ length: count }, (_, i) => ({
    address: MESSAGING_CONTRACT_ADDRESS,
    abi: messagingContractAbi,
    functionName: 'getSender' as const,
    args: [BigInt(i)] as const,
    chainId: omegaMessagingChain.id,
  }));

  const { data: messagesData, isLoading: isMessagesLoading } =
    useReadContracts({
      contracts: messageContracts,
      query: { enabled: count > 0, refetchInterval: 5_000 },
    });

  const { data: sendersData, isLoading: isSendersLoading } = useReadContracts({
    contracts: senderContracts,
    query: { enabled: count > 0, refetchInterval: 5_000 },
  });

  // Bridge action
  const {
    writeContract: bridgeWrite,
    isPending: isBridging,
  } = useWriteContract();

  const handleBridge = (id: number) => {
    bridgeWrite({
      address: MESSAGING_CONTRACT_ADDRESS,
      abi: messagingContractAbi,
      functionName: 'bridgeMessage',
      args: [BigInt(id)],
      chainId: omegaMessagingChain.id,
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (isCountLoading) {
    return <LoadingCard text="Loading message count..." />;
  }

  if (countError) {
    return (
      <div className="card text-red-400">
        Failed to read message count:{' '}
        {(countError as Error).message?.slice(0, 150)}
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="card text-center text-gray-500">
        No messages yet. Be the first to send one!
      </div>
    );
  }

  const isLoading = isMessagesLoading || isSendersLoading;

  if (isLoading) {
    return <LoadingCard text="Loading messages..." />;
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count })
        .map((_, i) => {
          const msgResult = messagesData?.[i];
          const senderResult = sendersData?.[i];

          const content =
            msgResult?.status === 'success'
              ? (msgResult.result as string)
              : null;
          const sender =
            senderResult?.status === 'success'
              ? (senderResult.result as string)
              : null;

          return (
            <div
              key={i}
              className="card flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-omega-400">#{i}</span>
                  {sender && (
                    <span className="truncate font-mono">{sender}</span>
                  )}
                </div>
                <p className="mt-1 break-words text-gray-200">
                  {content ?? (
                    <span className="italic text-gray-600">
                      Unable to load
                    </span>
                  )}
                </p>
              </div>

              <button
                onClick={() => handleBridge(i)}
                disabled={isBridging}
                className="shrink-0 rounded-lg border border-omega-700 bg-omega-900/40 px-3 py-1.5 text-xs font-medium text-omega-300 transition-colors hover:bg-omega-800/60 disabled:opacity-50"
              >
                {isBridging ? 'Bridging...' : 'Bridge'}
              </button>
            </div>
          );
        })
        .reverse()}
    </div>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="card flex items-center gap-3 text-gray-400">
      <svg
        className="h-5 w-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span>{text}</span>
    </div>
  );
}
