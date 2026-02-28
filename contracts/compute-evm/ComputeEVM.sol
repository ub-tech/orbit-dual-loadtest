// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ComputeEVM — Solidity equivalent of the Stylus compute benchmark
/// @notice Runs N iterations of keccak256 hashing with minimal storage (1 counter
///         increment per call). Functionally identical to the Stylus WASM contract
///         so both can be compared under the same compute workload.
contract ComputeEVM {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    uint256 private _callCount;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event ComputeCompleted(uint256 indexed iterations, bytes32 finalHash);

    // -----------------------------------------------------------------------
    // Public interface (same ABI shape as Stylus contract)
    // -----------------------------------------------------------------------

    /// @notice Run `iterations` rounds of keccak256 hashing from a fixed seed.
    /// @param iterations Number of hash iterations to perform.
    /// @return finalHash The hash result after all iterations.
    function computeHash(uint256 iterations) external returns (bytes32 finalHash) {
        // Start from the same fixed seed as the Stylus contract
        finalHash = keccak256("stylus-compute-bench");

        // Iterate — each round hashes the previous 32-byte result
        for (uint256 i = 0; i < iterations; i++) {
            finalHash = keccak256(abi.encodePacked(finalHash));
        }

        // Single SSTORE: increment call counter
        _callCount = _callCount + 1;

        emit ComputeCompleted(iterations, finalHash);
    }

    /// @notice Get the total number of computeHash calls.
    function callCount() external view returns (uint256) {
        return _callCount;
    }
}
