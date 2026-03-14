// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CCIPReceiverExample
/// @notice CCIP receiver with 3 modes: token-only, data-only (inbox), and data+tokens.
/// @dev Implements the defensive pattern recommended by Chainlink:
///      - Separates message reception from business logic via try/catch
///      - Uses try/catch to prevent message failure from locking tokens
///      - Tracks failed message IDs for owner-driven recovery via withdrawToken
///
///      Message modes:
///      - Token-only: holds received tokens in the contract.
///      - Data-only: stores messages in an on-chain inbox, queryable by anyone.
///      - Data+tokens: decodes a recipient address from data and forwards tokens.
///
///      Security patterns:
///      - Ownable2Step: prevents accidental ownership transfer to wrong address
///      - Pausable: when paused, _ccipReceive reverts — CCIP marks message as failed
///        and it can be manually re-executed later once unpaused
///      - ReentrancyGuard: prevents reentrancy via malicious token callbacks
///      - Double-mapping allowlist: (sourceChainSelector, sender) prevents cross-chain
///        sender impersonation
///      - Defensive try/catch: failed processing stores messageId, tokens stay in contract
contract CCIPReceiverExample is CCIPReceiver, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Cross-chain inbox: stores data-only messages for on-chain querying
    struct InboxMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        address sender;
        bytes data;
        uint256 timestamp;
    }

    InboxMessage[] public inbox;
    /// @dev Stores index + 1, so 0 means "not found". Subtract 1 to get the actual inbox index.
    mapping(bytes32 messageId => uint256 indexPlusOne) public messageIndex;

    // Batch allowlist entry
    struct AllowlistEntry {
        uint64 sourceChainSelector;
        address sender;
        bool allowed;
    }

    // Allowlisting: sender is allowlisted per source chain to prevent
    // a contract on chain B from impersonating an allowlisted sender on chain A.
    mapping(uint64 sourceChainSelector => mapping(address sender => bool allowed)) public allowlistedSenders;

    // Failed message tracking (defensive pattern)
    mapping(bytes32 => bool) public failedMessages;

    // Custom errors
    error SenderNotAllowed(uint64 sourceChainSelector, address sender);
    error InvalidRecipient();
    error NothingToWithdraw();
    error FailedToWithdrawEth(address owner, address target, uint256 value);
    error OnlySelf();

    // Events
    event TokensReceived(bytes32 indexed messageId, address[] tokens, uint256[] amounts);
    event DataReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address sender, bytes data);
    event TokensForwarded(bytes32 indexed messageId, address indexed recipient, address[] tokens, uint256[] amounts);
    event AllowlistUpdated(uint64 indexed sourceChainSelector, address indexed sender, bool allowed);
    event MessageFailed(bytes32 indexed messageId, bytes reason);

    /// @dev Only this contract can call processMessage (used by the try/catch pattern).
    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf();
        _;
    }

    constructor(address _router) CCIPReceiver(_router) Ownable(msg.sender) {}

    /// @notice Allowlist or deny a sender on a specific source chain.
    /// @param sourceChainSelector The CCIP chain selector of the source chain.
    /// @param sender The sender address to allowlist on that chain.
    /// @param allowed Whether the sender is allowed.
    function allowlistSender(uint64 sourceChainSelector, address sender, bool allowed) external onlyOwner {
        allowlistedSenders[sourceChainSelector][sender] = allowed;
    }

    /// @notice Batch update the allowlist — add/remove multiple (chain, sender) pairs in one call.
    /// @param entries Array of AllowlistEntry structs with chain selector, sender, and allowed flag.
    function updateAllowlist(AllowlistEntry[] calldata entries) external onlyOwner {
        for (uint256 i = 0; i < entries.length; i++) {
            allowlistedSenders[entries[i].sourceChainSelector][entries[i].sender] = entries[i].allowed;
            emit AllowlistUpdated(entries[i].sourceChainSelector, entries[i].sender, entries[i].allowed);
        }
    }

    /// @notice Defensive receive: validates allowlists, then delegates to processMessage
    ///         via try/catch. If processing fails, tokens stay in the contract and the
    ///         message ID is recorded. The owner can recover tokens via withdrawToken.
    /// @dev When paused, this reverts — CCIP marks the message as failed and it can be
    ///      manually re-executed later via the CCIP explorer once unpaused.
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override whenNotPaused nonReentrant {
        address sender = abi.decode(message.sender, (address));
        if (!allowlistedSenders[message.sourceChainSelector][sender]) {
            revert SenderNotAllowed(message.sourceChainSelector, sender);
        }

        // Defensive pattern: try processing, catch and record on failure.
        // On failure, tokens remain in this contract (they were already transferred
        // by the router before _ccipReceive is called) and can be recovered by the owner.
        try this.processMessage(message) {
            // Success — events are emitted inside processMessage
        } catch (bytes memory reason) {
            failedMessages[message.messageId] = true;
            emit MessageFailed(message.messageId, reason);
        }
    }

    /// @notice Process a CCIP message. Called by _ccipReceive via this.processMessage()
    ///         so that failures are caught by the try/catch wrapper.
    /// @dev Must be external for try/catch but restricted to onlySelf.
    function processMessage(Client.Any2EVMMessage calldata message) external onlySelf {
        bool hasData = message.data.length > 0;
        bool hasTokens = message.destTokenAmounts.length > 0;

        if (hasTokens && !hasData) {
            _handleTokensOnly(message);
        } else if (hasData && !hasTokens) {
            _handleDataOnly(message);
        } else if (hasData && hasTokens) {
            _handleDataAndTokens(message);
        }
    }

    function _handleTokensOnly(Client.Any2EVMMessage memory message) internal {
        (address[] memory tokens, uint256[] memory amounts) = _extractTokenInfo(message);
        emit TokensReceived(message.messageId, tokens, amounts);
    }

    function _handleDataOnly(Client.Any2EVMMessage memory message) internal {
        address sender = abi.decode(message.sender, (address));
        messageIndex[message.messageId] = inbox.length + 1; // +1 so that 0 means "not found"
        inbox.push(InboxMessage({
            messageId: message.messageId,
            sourceChainSelector: message.sourceChainSelector,
            sender: sender,
            data: message.data,
            timestamp: block.timestamp
        }));
        emit DataReceived(message.messageId, message.sourceChainSelector, sender, message.data);
    }

    /// @notice Get the total number of messages in the inbox.
    function getInboxLength() external view returns (uint256) {
        return inbox.length;
    }

    /// @notice Get a message from the inbox by index.
    /// @param index The inbox index (0-based).
    function getInboxMessage(uint256 index) external view returns (InboxMessage memory) {
        return inbox[index];
    }

    /// @notice Get the latest N messages from the inbox.
    /// @param count Maximum number of messages to return.
    function getLatestMessages(uint256 count) external view returns (InboxMessage[] memory) {
        uint256 len = inbox.length;
        if (count > len) {
            count = len;
        }
        InboxMessage[] memory result = new InboxMessage[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = inbox[len - count + i];
        }
        return result;
    }

    function _handleDataAndTokens(Client.Any2EVMMessage memory message) internal {
        address recipient = abi.decode(message.data, (address));
        if (recipient == address(0)) revert InvalidRecipient();

        (address[] memory tokens, uint256[] memory amounts) = _extractTokenInfo(message);

        for (uint256 i = 0; i < message.destTokenAmounts.length; i++) {
            IERC20(message.destTokenAmounts[i].token).safeTransfer(
                recipient, message.destTokenAmounts[i].amount
            );
        }

        emit TokensForwarded(message.messageId, recipient, tokens, amounts);
    }

    function _extractTokenInfo(Client.Any2EVMMessage memory message)
        internal pure returns (address[] memory tokens, uint256[] memory amounts)
    {
        tokens = new address[](message.destTokenAmounts.length);
        amounts = new uint256[](message.destTokenAmounts.length);
        for (uint256 i = 0; i < message.destTokenAmounts.length; i++) {
            tokens[i] = message.destTokenAmounts[i].token;
            amounts[i] = message.destTokenAmounts[i].amount;
        }

        return (tokens, amounts);
    }

    /// @notice Pause message processing (owner only). Use in case of emergency.
    /// @dev While paused, incoming CCIP messages will revert and can be manually
    ///      re-executed later via the CCIP explorer once unpaused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause message processing (owner only).
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Fallback to allow the contract to receive native currency.
    receive() external payable {}

    /// @notice Withdraw native currency from this contract (owner only).
    /// @param beneficiary The address to send the native currency to.
    function withdraw(address beneficiary) public onlyOwner {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();

        (bool sent, ) = beneficiary.call{value: amount}("");
        if (!sent) revert FailedToWithdrawEth(msg.sender, beneficiary, amount);
    }

    /// @notice Withdraw ERC20 tokens from this contract (owner only).
    /// @dev Use this to recover tokens from failed messages or any stuck tokens.
    ///      Pass 0 for amount to withdraw the full balance.
    /// @param beneficiary The address to send the tokens to.
    /// @param token The ERC20 token contract address.
    /// @param amount The amount to withdraw (0 = full balance).
    function withdrawToken(address beneficiary, address token, uint256 amount) public onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NothingToWithdraw();

        uint256 transferAmount = amount == 0 ? balance : amount;
        IERC20(token).safeTransfer(beneficiary, transferAmount);
    }
}
