// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MessagingEVM — Solidity equivalent of the Stylus messaging contract
/// @notice Stores messages on-chain with auto-incrementing IDs. Functionally
///         identical to the Stylus WASM contract so both can be compared under
///         the same burst workload on the same Arbitrum L2 chain.
contract MessagingEVM {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    mapping(uint256 => string) private _messages;
    mapping(uint256 => address) private _senders;
    uint256 private _messageCount;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event MessageSent(uint256 indexed id, address indexed sender, string content);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error EmptyMessage();
    error MessageNotFound(uint256 id);

    // -----------------------------------------------------------------------
    // Public interface (same ABI shape as Stylus contract)
    // -----------------------------------------------------------------------

    /// @notice Store a new message on-chain.
    /// @param content The message text (must not be empty).
    /// @return id The auto-assigned message ID.
    function sendMessage(string calldata content) external returns (uint256 id) {
        if (bytes(content).length == 0) revert EmptyMessage();

        id = _messageCount;
        _messageCount = id + 1;

        _messages[id] = content;
        _senders[id] = msg.sender;

        emit MessageSent(id, msg.sender, content);
    }

    /// @notice Retrieve a message by ID.
    function getMessage(uint256 id) external view returns (string memory) {
        if (id >= _messageCount) revert MessageNotFound(id);
        return _messages[id];
    }

    /// @notice Get the total number of stored messages.
    function messageCount() external view returns (uint256) {
        return _messageCount;
    }
}
