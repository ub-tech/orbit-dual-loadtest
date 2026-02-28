/**
 * ABI for the Stylus MessagingContract deployed on the Omega L2 chain.
 *
 * Public functions:
 *   send_message(string) -> uint256
 *   get_message(uint256) -> string
 *   get_sender(uint256) -> address
 *   message_count() -> uint256
 *   bridge_message(uint256)
 *
 * Events: MessageSent, MessageBridged
 * Errors: MessageNotFound, BridgeCallFailed, EmptyMessage
 */
export const messagingContractAbi = [
  // ── Functions ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'sendMessage',
    inputs: [{ name: 'content', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMessage',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSender',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'messageCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'bridgeMessage',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ── Events ─────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'MessageSent',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'content', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MessageBridged',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'bridgeTxHash', type: 'bytes32', indexed: false },
    ],
  },

  // ── Errors ─────────────────────────────────────────────────────────────
  {
    type: 'error',
    name: 'MessageNotFound',
    inputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'BridgeCallFailed',
    inputs: [{ name: 'reason', type: 'bytes' }],
  },
  {
    type: 'error',
    name: 'EmptyMessage',
    inputs: [],
  },
] as const;
