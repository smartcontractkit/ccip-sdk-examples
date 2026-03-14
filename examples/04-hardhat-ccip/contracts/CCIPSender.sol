// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CCIPSender
/// @notice CCIP sender with pre-encoded extraArgs passthrough and peer registration.
/// @dev Supports all 3 message types: token-only, data-only, and data+tokens (programmable token transfer).
///      The extraArgs passthrough pattern lets offchain code (e.g. the CCIP SDK) build
///      the correct extraArgs for the destination chain, keeping the contract simple and chain-agnostic.
///
///      Follows the industry-standard peer registration pattern (used by LayerZero OApp,
///      Wormhole NTT, Hyperlane Router): the owner registers trusted (destChainSelector, receiver)
///      pairs. Sends to unregistered destinations revert.
///
///      Security patterns:
///      - Ownable2Step: prevents accidental ownership transfer to wrong address
///      - Pausable: emergency circuit breaker for owner to halt sends
///      - ReentrancyGuard: prevents reentrancy via malicious token callbacks
///      - Peer registration: only allows sends to registered (chain, receiver) pairs
///      - Exact fee handling: calculates fee via i_router.getFee(), refunds excess native
///      - Fee token deduplication: optimizes when fee token == a transfer token
contract CCIPSender is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IRouterClient public immutable i_router;

    /// @notice Registered peers: destChainSelector => trusted receiver address.
    /// @dev Only registered (chain, receiver) pairs can be used as destinations.
    mapping(uint64 destChainSelector => address peer) public peers;

    error NothingToWithdraw();
    error FailedToWithdrawEth(address owner, address target, uint256 value);
    error InsufficientNativeFee(uint256 required, uint256 provided);
    error PeerNotRegistered(uint64 destChainSelector, address receiver);

    event MessageSent(bytes32 indexed messageId, uint64 indexed destChainSelector);
    event PeerSet(uint64 indexed destChainSelector, address peer);

    constructor(address _router) Ownable(msg.sender) {
        i_router = IRouterClient(_router);
    }

    /// @notice Register or remove a trusted peer on a destination chain.
    /// @param destChainSelector The CCIP chain selector of the destination.
    /// @param peer The trusted receiver address (address(0) to remove).
    function setPeer(uint64 destChainSelector, address peer) external onlyOwner {
        peers[destChainSelector] = peer;
        emit PeerSet(destChainSelector, peer);
    }

    /// @notice Send a CCIP message with pre-encoded extraArgs.
    /// @dev Handles both native and ERC20 fee payment. When the fee token is the same
    ///      as a transfer token, combines into a single transferFrom + approval for gas efficiency.
    ///      Excess native fees are refunded to the caller.
    /// @param destChainSelector Destination chain selector
    /// @param receiver Receiver address on destination (must match registered peer)
    /// @param data Arbitrary data payload (empty bytes for token-only)
    /// @param tokenAmounts Token transfers (empty array for data-only)
    /// @param extraArgs Pre-encoded extra args (built offchain via SDK)
    /// @param feeToken Fee token address (address(0) for native)
    function send(
        uint64 destChainSelector,
        address receiver,
        bytes calldata data,
        Client.EVMTokenAmount[] calldata tokenAmounts,
        bytes calldata extraArgs,
        address feeToken
    ) external payable nonReentrant whenNotPaused returns (bytes32 messageId) {
        // Validate destination is a registered peer
        address registeredPeer = peers[destChainSelector];
        if (registeredPeer == address(0) || registeredPeer != receiver) {
            revert PeerNotRegistered(destChainSelector, receiver);
        }

        // Build the CCIP message and calculate fees first
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: extraArgs,
            feeToken: feeToken
        });

        uint256 fees = i_router.getFee(destChainSelector, message);

        if (feeToken == address(0)) {
            // Native fee payment
            if (msg.value < fees) revert InsufficientNativeFee(fees, msg.value);

            // Transfer tokens from caller to this contract, then approve router
            for (uint256 i = 0; i < tokenAmounts.length; i++) {
                IERC20(tokenAmounts[i].token).safeTransferFrom(msg.sender, address(this), tokenAmounts[i].amount);
                IERC20(tokenAmounts[i].token).safeIncreaseAllowance(address(i_router), tokenAmounts[i].amount);
            }

            messageId = i_router.ccipSend{value: fees}(destChainSelector, message);

            // Refund excess native to caller
            uint256 excess = msg.value - fees;
            if (excess > 0) {
                (bool sent, ) = msg.sender.call{value: excess}("");
                if (!sent) revert FailedToWithdrawEth(msg.sender, msg.sender, excess);
            }
        } else {
            // ERC20 fee payment — handle the case where feeToken == a transfer token
            bool feeIncludedInTransfer = false;

            for (uint256 i = 0; i < tokenAmounts.length; i++) {
                if (tokenAmounts[i].token == feeToken && !feeIncludedInTransfer) {
                    // Fee token matches this transfer token: pull combined amount in one transferFrom
                    uint256 combined = tokenAmounts[i].amount + fees;
                    IERC20(feeToken).safeTransferFrom(msg.sender, address(this), combined);
                    IERC20(feeToken).safeIncreaseAllowance(address(i_router), combined);
                    feeIncludedInTransfer = true;
                } else {
                    IERC20(tokenAmounts[i].token).safeTransferFrom(msg.sender, address(this), tokenAmounts[i].amount);
                    IERC20(tokenAmounts[i].token).safeIncreaseAllowance(address(i_router), tokenAmounts[i].amount);
                }
            }

            // If fee token was not among the transfer tokens, pull it separately
            if (!feeIncludedInTransfer) {
                IERC20(feeToken).safeTransferFrom(msg.sender, address(this), fees);
                IERC20(feeToken).safeIncreaseAllowance(address(i_router), fees);
            }

            messageId = i_router.ccipSend(destChainSelector, message);
        }

        emit MessageSent(messageId, destChainSelector);

        return messageId;
    }

    /// @notice Pause all sends (owner only). Use in case of emergency.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause sends (owner only).
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
    /// @dev Pass 0 for amount to withdraw the full balance.
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
