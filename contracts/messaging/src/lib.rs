//! Omega Messaging — Stylus smart contract for on-chain messaging with L2-to-L1 bridge support.
//!
//! This contract stores messages on an Arbitrum L2 chain and provides bridging
//! functionality to L1 via the ArbSys precompile. Messages are stored with auto-
//! incrementing IDs and are retrievable by anyone. Bridging sends the message
//! content to L1 where it can be executed after the challenge period.

#![cfg_attr(not(any(feature = "export-abi", test)), no_main)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use stylus_sdk::prelude::*;
use stylus_sdk::storage::{StorageAddress, StorageMap, StorageString, StorageU256};
use stylus_sdk::alloy_primitives::{Address, Bytes, U256};
use stylus_sdk::{evm, msg};
use alloy_sol_types::{sol, SolError};

// ---------------------------------------------------------------------------
// Events and errors — ABI-compatible with Solidity via the sol! macro
// ---------------------------------------------------------------------------

sol! {
    /// Emitted when a new message is stored on-chain.
    event MessageSent(uint256 indexed id, address indexed sender, string content);

    /// Emitted when a message is submitted to the L2-to-L1 bridge.
    event MessageBridged(uint256 indexed id, bytes32 bridgeTxHash);

    /// The requested message ID does not exist.
    error MessageNotFound(uint256 id);

    /// The bridge call to ArbSys failed.
    error BridgeCallFailed(bytes reason);

    /// The caller supplied an empty message string.
    error EmptyMessage();
}

// ---------------------------------------------------------------------------
// ArbSys precompile interface — L2-to-L1 messaging on Arbitrum
// ---------------------------------------------------------------------------

sol_interface! {
    interface IArbSys {
        function sendTxToL1(address destination, bytes calldata data) external payable returns (uint256);
    }
}

/// ArbSys precompile lives at a fixed address on every Arbitrum chain.
const ARBSYS_ADDR: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x64,
]);

// ---------------------------------------------------------------------------
// Contract storage
// ---------------------------------------------------------------------------

/// On-chain messaging contract with bridge support.
///
/// Storage layout:
/// - `messages`:      message ID -> content string
/// - `senders`:       message ID -> sender address
/// - `message_count`: auto-incrementing message counter (next available ID)
#[storage]
#[entrypoint]
pub struct MessagingContract {
    messages: StorageMap<U256, StorageString>,
    senders: StorageMap<U256, StorageAddress>,
    message_count: StorageU256,
}

// ---------------------------------------------------------------------------
// Public ABI (Solidity-compatible via #[public])
// ---------------------------------------------------------------------------

#[public]
impl MessagingContract {
    /// Store a new message on-chain.
    ///
    /// Assigns the next sequential ID, records the caller as sender, and emits
    /// a `MessageSent` event. Returns the assigned message ID.
    ///
    /// # Errors
    /// Reverts with `EmptyMessage` if `content` is an empty string.
    pub fn send_message(&mut self, content: String) -> Result<U256, Vec<u8>> {
        if content.is_empty() {
            return Err(EmptyMessage {}.abi_encode());
        }

        // Allocate the next ID and advance the counter.
        let id = self.message_count.get();
        self.message_count.set(id + U256::from(1));

        // Persist message content and sender address.
        self.messages.setter(id).set_str(&content);
        self.senders.setter(id).set(msg::sender());

        // Emit Solidity-compatible event for indexers.
        evm::log(MessageSent {
            id,
            sender: msg::sender(),
            content,
        });

        Ok(id)
    }

    /// Retrieve a message by its ID.
    ///
    /// # Errors
    /// Reverts with `MessageNotFound` if the ID has not been assigned yet.
    pub fn get_message(&self, id: U256) -> Result<String, Vec<u8>> {
        if id >= self.message_count.get() {
            return Err(MessageNotFound { id }.abi_encode());
        }
        Ok(self.messages.getter(id).get_string())
    }

    /// Get the address that sent a given message.
    ///
    /// # Errors
    /// Reverts with `MessageNotFound` if the ID has not been assigned yet.
    pub fn get_sender(&self, id: U256) -> Result<Address, Vec<u8>> {
        if id >= self.message_count.get() {
            return Err(MessageNotFound { id }.abi_encode());
        }
        Ok(self.senders.getter(id).get())
    }

    /// Get the total number of messages stored.
    ///
    /// The returned value is also the next ID that will be assigned.
    pub fn message_count(&self) -> U256 {
        self.message_count.get()
    }

    /// Bridge a stored message to L1 via the ArbSys precompile.
    ///
    /// Calls `ArbSys.sendTxToL1()` which enqueues an L2-to-L1 message that
    /// becomes executable on L1 after the challenge period elapses.
    ///
    /// The L1 destination address is set to `msg::sender()`, so the caller
    /// will be the recipient on L1.
    ///
    /// # Safety
    /// Uses the deprecated `StorageCache::flush()` before the cross-contract call,
    /// which is required by the Stylus SDK to prevent storage aliasing during
    /// reentrant or cross-contract execution.
    ///
    /// # Errors
    /// - `MessageNotFound` if the ID does not exist.
    /// - `BridgeCallFailed` if the ArbSys call reverts.
    #[allow(deprecated)]
    pub fn bridge_message(&mut self, id: U256) -> Result<(), Vec<u8>> {
        // Verify the message exists before doing any external work.
        if id >= self.message_count.get() {
            return Err(MessageNotFound { id }.abi_encode());
        }

        // Read message content while we still hold the storage cache.
        let content = self.messages.getter(id).get_string();

        // CRITICAL: flush the storage cache before any cross-contract call.
        // The Stylus SDK requires this to ensure storage writes are committed
        // before control transfers to another contract.
        unsafe {
            stylus_sdk::storage::StorageCache::flush();
        }

        // Encode message content as raw bytes for L1 delivery.
        let data: Bytes = content.as_bytes().to_vec().into();

        // Invoke ArbSys.sendTxToL1(destination, data).
        // destination = msg::sender() so the bridge message is addressed to the
        // same account on L1 that initiated the bridge on L2.
        let arbsys = IArbSys::new(ARBSYS_ADDR);
        let config = stylus_sdk::call::Call::new();

        match arbsys.send_tx_to_l_1(config, msg::sender(), data) {
            Ok(ticket_id) => {
                // Convert the returned ticket ID (U256) to a bytes32 for the event.
                let bridge_tx_hash: [u8; 32] = ticket_id.to_be_bytes();

                evm::log(MessageBridged {
                    id,
                    bridgeTxHash: bridge_tx_hash.into(),
                });

                Ok(())
            }
            Err(err) => {
                let reason: Vec<u8> = alloc::format!("{:?}", err).into_bytes();
                Err(BridgeCallFailed {
                    reason: reason.into(),
                }
                .abi_encode())
            }
        }
    }
}
