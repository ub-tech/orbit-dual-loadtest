//! Omega Compute — Stylus smart contract for iterated keccak256 benchmarking.
//!
//! This contract runs N iterations of keccak256 hashing with minimal storage
//! (1 counter increment per call) to isolate WASM computation cost from storage
//! overhead. Ink metering makes loop/hash operations dramatically cheaper than
//! EVM opcodes, so this benchmark should show a clear Stylus gas advantage.

#![cfg_attr(not(any(feature = "export-abi", test)), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::prelude::*;
use stylus_sdk::storage::StorageU256;
use stylus_sdk::alloy_primitives::{B256, U256};
use stylus_sdk::{crypto, evm};
use alloy_sol_types::sol;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

sol! {
    /// Emitted when a compute_hash call completes.
    event ComputeCompleted(uint256 indexed iterations, bytes32 finalHash);
}

// ---------------------------------------------------------------------------
// Contract storage
// ---------------------------------------------------------------------------

/// Iterated keccak256 compute benchmark contract.
///
/// Storage layout:
/// - `call_count`: number of times compute_hash has been called (1 SSTORE per call)
#[storage]
#[entrypoint]
pub struct ComputeContract {
    call_count: StorageU256,
}

// ---------------------------------------------------------------------------
// Public ABI (Solidity-compatible via #[public])
// ---------------------------------------------------------------------------

#[public]
impl ComputeContract {
    /// Run `iterations` rounds of keccak256 hashing starting from a fixed seed.
    ///
    /// Each iteration hashes the previous 32-byte result:
    ///   hash_0 = keccak256("stylus-compute-bench")
    ///   hash_i = keccak256(hash_{i-1})
    ///
    /// Increments `call_count` by 1 (single SSTORE) and emits `ComputeCompleted`.
    /// Returns the final hash after all iterations.
    pub fn compute_hash(&mut self, iterations: U256) -> Result<B256, Vec<u8>> {
        // Start from fixed seed
        let mut hash: [u8; 32] = crypto::keccak(b"stylus-compute-bench").into();

        // Iterate — this is pure WASM computation priced in ink
        let n = iterations.saturating_to::<u64>();
        for _ in 0..n {
            hash = crypto::keccak(&hash).into();
        }

        // Single SSTORE: increment call counter
        let count = self.call_count.get();
        self.call_count.set(count + U256::from(1));

        let final_hash = B256::from(hash);

        // Emit event
        evm::log(ComputeCompleted {
            iterations,
            finalHash: final_hash,
        });

        Ok(final_hash)
    }

    /// Get the total number of compute_hash calls.
    pub fn call_count(&self) -> U256 {
        self.call_count.get()
    }
}
