// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "synthetix/contracts/interfaces/ISynthetix.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/ISwap.sol";

/**
 * @title SynthSwapper
 * @notice Replacement of Virtual Synths in favor of gas savings. Allows swapping synths via the Synthetix protocol
 * or Saddle's pools. The `Bridge.sol` contract will deploy minimal clones of this contract upon initiating
 * any cross-asset swaps.
 */
contract SynthSwapper {
    using SafeERC20 for IERC20;

    address payable immutable owner;
    // SYNTHETIX points to `ProxyERC20` (0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F).
    // This contract is a proxy of `Synthetix` and is used to exchange synths.
    ISynthetix public constant SYNTHETIX =
        ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // "SADDLE" in bytes32 form
    bytes32 public constant TRACKING =
        0x534144444c450000000000000000000000000000000000000000000000000000;

    /**
     * @notice Deploys this contract and sets the `owner`. Note that when creating clones of this contract,
     * the owner will be constant and cannot be changed.
     */
    constructor() public {
        owner = msg.sender;
    }

    /**
     * @notice Swaps the synth to another synth via the Synthetix protocol.
     * @param sourceKey currency key of the source synth
     * @param synthAmount amount of the synth to swap
     * @param destKey currency key of the destination synth
     * @return amount of the destination synth received
     */
    function swapSynth(
        bytes32 sourceKey,
        uint256 synthAmount,
        bytes32 destKey
    ) external returns (uint256) {
        require(msg.sender == owner, "is not owner");
        return
            SYNTHETIX.exchangeWithTracking(
                sourceKey,
                synthAmount,
                destKey,
                msg.sender,
                TRACKING
            );
    }

    /**
     * @notice Approves the given `tokenFrom` and swaps it to another token via the given `swap` pool.
     * @param swap the address of a pool to swap through
     * @param tokenFrom the address of the stored synth
     * @param tokenFromIndex the index of the token to swap from
     * @param tokenToIndex the token the user wants to swap to
     * @param tokenFromAmount the amount of the token to swap
     * @param minAmount the min amount the user would like to receive, or revert.
     * @param deadline latest timestamp to accept this transaction
     * @param recipient the address of the recipient
     * @param shouldDestroy whether this contract should be destroyed after this call
     */
    function swapSynthToToken(
        ISwap swap,
        IERC20 tokenFrom,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 minAmount,
        uint256 deadline,
        address recipient,
        bool shouldDestroy
    ) external {
        require(msg.sender == owner, "is not owner");
        tokenFrom.approve(address(swap), tokenFromAmount);
        swap.swap(
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            minAmount,
            deadline
        );
        IERC20 tokenTo = swap.getToken(tokenToIndex);
        tokenTo.safeTransfer(recipient, tokenTo.balanceOf(address(this)));
        if (shouldDestroy) {
            selfdestruct(msg.sender);
        }
    }

    /**
     * @notice Withdraws the given amount of `token` to the `recipient`.
     * @param token the address of the token to withdraw
     * @param recipient the address of the account to receive the token
     * @param withdrawAmount the amount of the token to withdraw
     * @param shouldDestroy whether this contract should be destroyed after this call
     */
    function withdraw(
        IERC20 token,
        address recipient,
        uint256 withdrawAmount,
        bool shouldDestroy
    ) external {
        require(msg.sender == owner, "is not owner");
        token.safeTransfer(recipient, withdrawAmount);
        if (shouldDestroy) {
            selfdestruct(msg.sender);
        }
    }
}
