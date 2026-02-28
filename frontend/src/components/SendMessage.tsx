'use client';

import { useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { messagingContractAbi } from '@/abi/MessagingContract';
import {
  MESSAGING_CONTRACT_ADDRESS,
  omegaMessagingChain,
} from '@/config/chains';

export function SendMessage() {
  const [content, setContent] = useState('');

  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSend = useCallback(() => {
    if (!content.trim()) return;

    writeContract({
      address: MESSAGING_CONTRACT_ADDRESS,
      abi: messagingContractAbi,
      functionName: 'sendMessage',
      args: [content],
      chainId: omegaMessagingChain.id,
    });
  }, [content, writeContract]);

  // Clear input once confirmed
  const handleReset = useCallback(() => {
    setContent('');
    reset();
  }, [reset]);

  const error = writeError || receiptError;
  const isBusy = isWritePending || isConfirming;

  return (
    <div className="card space-y-4">
      {/* Input row */}
      <div className="flex gap-3">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isBusy) handleSend();
          }}
          placeholder="Type your message..."
          disabled={isBusy}
          className="input-field flex-1"
        />
        <button
          onClick={handleSend}
          disabled={isBusy || !content.trim()}
          className="btn-primary whitespace-nowrap"
        >
          {isWritePending
            ? 'Confirm in wallet...'
            : isConfirming
              ? 'Sending...'
              : 'Send'}
        </button>
      </div>

      {/* Status feedback */}
      {isConfirmed && (
        <div className="flex items-center justify-between rounded-lg border border-green-800 bg-green-900/30 px-4 py-2 text-sm text-green-300">
          <span>Message sent successfully!</span>
          <button
            onClick={handleReset}
            className="ml-4 underline hover:text-green-200"
          >
            Send another
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300">
          <p className="font-medium">Transaction failed</p>
          <p className="mt-1 break-all text-xs text-red-400">
            {(error as Error).message?.slice(0, 200) ?? 'Unknown error'}
          </p>
        </div>
      )}

      {txHash && !isConfirmed && !error && (
        <p className="text-xs text-gray-500">
          TX: <span className="font-mono">{txHash}</span>
        </p>
      )}
    </div>
  );
}
