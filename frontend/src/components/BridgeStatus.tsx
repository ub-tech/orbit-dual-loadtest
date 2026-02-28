'use client';

import { useState, useCallback } from 'react';
import { useWatchContractEvent } from 'wagmi';
import { messagingContractAbi } from '@/abi/MessagingContract';
import {
  MESSAGING_CONTRACT_ADDRESS,
  omegaMessagingChain,
} from '@/config/chains';

interface BridgeEvent {
  messageId: string;
  bridgeTxHash: string;
  timestamp: number;
  status: 'pending' | 'batched' | 'confirmed';
}

/**
 * Watches for MessageBridged events emitted by the Stylus contract
 * and displays bridge activity with status tracking.
 */
export function BridgeStatus() {
  const [events, setEvents] = useState<BridgeEvent[]>([]);

  useWatchContractEvent({
    address: MESSAGING_CONTRACT_ADDRESS,
    abi: messagingContractAbi,
    eventName: 'MessageBridged',
    chainId: omegaMessagingChain.id,
    onLogs(logs) {
      for (const log of logs) {
        // Use viem's decoded args for type-safe access
        const args = (log as any).args as {
          id: bigint;
          bridgeTxHash: `0x${string}`;
        } | undefined;

        const messageId = args?.id?.toString() ?? 'unknown';
        const bridgeTxHash = args?.bridgeTxHash ?? '0x';

        setEvents((prev) => {
          if (prev.some((e) => e.messageId === messageId)) return prev;
          return [
            {
              messageId,
              bridgeTxHash,
              timestamp: Date.now(),
              status: 'pending',
            },
            ...prev,
          ];
        });
      }
    },
  });

  if (events.length === 0) {
    return (
      <div className="card text-center text-gray-500">
        No bridge activity yet. Bridge a message to see its status here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.messageId} className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={event.status} />
              <span className="text-sm font-medium text-gray-200">
                Message #{event.messageId}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="mt-2 rounded-lg bg-gray-800/50 px-3 py-2">
            <p className="text-xs text-gray-500">Bridge TX Hash</p>
            <p className="mt-0.5 break-all font-mono text-xs text-gray-300">
              {event.bridgeTxHash}
            </p>
          </div>

          <div className="mt-3">
            <BridgeTimeline status={event.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: BridgeEvent['status'] }) {
  const styles: Record<BridgeEvent['status'], string> = {
    pending:
      'border-yellow-700 bg-yellow-900/30 text-yellow-300',
    batched:
      'border-blue-700 bg-blue-900/30 text-blue-300',
    confirmed:
      'border-green-700 bg-green-900/30 text-green-300',
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function BridgeTimeline({ status }: { status: BridgeEvent['status'] }) {
  const steps = [
    { key: 'pending', label: 'Pending' },
    { key: 'batched', label: 'Batched' },
    { key: 'confirmed', label: 'Confirmed' },
  ] as const;

  const currentIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const isActive = idx <= currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1">
            {idx > 0 && (
              <div
                className={`h-px w-6 ${isActive ? 'bg-omega-500' : 'bg-gray-700'}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  isActive ? 'bg-omega-500' : 'bg-gray-700'
                }`}
              />
              <span
                className={`text-xs ${
                  isActive ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
