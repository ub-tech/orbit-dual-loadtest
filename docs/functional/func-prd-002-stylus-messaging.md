# PRD-002: Stylus Messaging Contract + Bridge Integration

**Status:** Approved
**Author:** EM (CLAUDE.md Orchestrator)
**Date:** 2026-02-27
**Parent:** [top-level-prd.md](top-level-prd.md)

## Problem Statement

The messaging DApp needs a smart contract on the Arbitrum L2 that stores messages, tracks senders, and bridges messages to the settlement chain. Stylus (Rust-based smart contracts compiled to WASM) provides memory safety and performance advantages over Solidity.

## Goals

1. Build a Stylus contract in Rust that handles message storage and retrieval
2. Implement cross-chain bridge messaging via Arbitrum bridge contracts
3. Deploy using `cargo stylus` toolchain

## Functional Requirements

### FR-1: Contract Storage

```rust
use stylus_sdk::prelude::*;
use stylus_sdk::storage::{StorageMap, StorageU256, StorageAddress};
use stylus_sdk::alloy_primitives::{U256, Address};

#[storage]
#[entrypoint]
pub struct MessagingContract {
    messages: StorageMap<U256, StorageString>,
    senders: StorageMap<U256, StorageAddress>,
    message_count: StorageU256,
}
```

**Storage fields:**
- `messages`: Map from message ID (U256) to message content (String)
- `senders`: Map from message ID to sender address
- `message_count`: Auto-incrementing counter for message IDs

### FR-2: Public Functions

```rust
#[public]
impl MessagingContract {
    // Store a new message, return its ID
    pub fn send_message(&mut self, content: String) -> U256;

    // Retrieve a message by ID
    pub fn get_message(&self, id: U256) -> String;

    // Get the sender of a message
    pub fn get_sender(&self, id: U256) -> Address;

    // Get total message count
    pub fn message_count(&self) -> U256;

    // Bridge a message to L1 via Arbitrum bridge
    pub fn bridge_message(&mut self, id: U256) -> Result<(), Vec<u8>>;
}
```

**Function specifications:**

| Function | Access | State Change | Emits Event |
|---|---|---|---|
| `send_message` | Anyone | Write (new message + sender + counter) | `MessageSent` |
| `get_message` | Anyone | Read-only | None |
| `get_sender` | Anyone | Read-only | None |
| `message_count` | Anyone | Read-only | None |
| `bridge_message` | Anyone | Write (bridge call) | `MessageBridged` |

### FR-3: Events

```rust
sol! {
    event MessageSent(uint256 indexed id, address indexed sender, string content);
    event MessageBridged(uint256 indexed id, bytes32 bridgeTxHash);
}
```

Events are ABI-compatible with Solidity, enabling standard indexing tools.

### FR-4: Bridge Integration

Cross-chain messaging via `sol_interface!` to call Arbitrum's `ArbSys` precompile:

```rust
sol_interface! {
    interface IArbSys {
        function sendTxToL1(address destination, bytes calldata data)
            external payable returns (uint256);
    }
}
```

**Bridge flow:**
1. User calls `bridge_message(id)` on L2
2. Contract reads message content from storage
3. Contract calls `ArbSys.sendTxToL1()` with message data
4. L2-to-L1 message enters the outbox after challenge period
5. Message can be executed on L1 after confirmation

**Safety requirements:**
- Call `flush_storage_cache()` before any `RawCall` or cross-contract call
- Set appropriate gas limits for cross-contract calls
- Handle revert from bridge contract gracefully

### FR-5: Error Handling

```rust
sol! {
    error MessageNotFound(uint256 id);
    error BridgeCallFailed(bytes reason);
    error EmptyMessage();
}
```

- `send_message` reverts with `EmptyMessage` if content is empty
- `get_message` reverts with `MessageNotFound` if ID doesn't exist
- `bridge_message` reverts with `BridgeCallFailed` if ArbSys call fails

## Non-Functional Requirements

- Contract must pass `cargo stylus check` (WASM size within limit)
- Gas cost per `send_message` should be competitive with Solidity equivalent
- No use of `unsafe` Rust (rely on Stylus SDK safety guarantees)
- Reentrancy protection: default revert behavior (no `reentrant` feature flag)

## Technical Approach

1. Rust project with `stylus-sdk` and `alloy-primitives` dependencies
2. Build with `cargo stylus check` for WASM validation
3. Deploy with `cargo stylus deploy --private-key <KEY> --endpoint <L2_RPC>`
4. ABI generation automatic (Solidity-compatible via `#[public]` macro)

## Dependencies

- `stylus-sdk` — Stylus smart contract framework
- `alloy-primitives` — Ethereum primitive types
- `cargo-stylus` — CLI for check/deploy
- Running Arbitrum L2 chain (from PRD-001)
- `ArbSys` precompile at `0x0000000000000000000000000000000000000064`

## Acceptance Criteria

- [ ] Contract compiles with `cargo stylus check` (WASM valid, size within limit)
- [ ] `cargo stylus deploy` succeeds on L2 chain
- [ ] `send_message("hello")` stores message and returns ID 0
- [ ] `get_message(0)` returns "hello"
- [ ] `get_sender(0)` returns the caller's address
- [ ] `message_count()` returns correct count after multiple sends
- [ ] `MessageSent` event emitted with correct indexed fields
- [ ] `bridge_message(0)` successfully calls ArbSys.sendTxToL1
- [ ] Empty message reverts with `EmptyMessage` error
- [ ] Non-existent message ID reverts with `MessageNotFound` error
- [ ] Bridge message appears in L1 outbox after challenge period

## Open Questions

1. Maximum message length — should there be a cap for gas efficiency?
2. Message deletion — should senders be able to delete their messages?
3. Access control — should bridging be restricted to the message sender?
