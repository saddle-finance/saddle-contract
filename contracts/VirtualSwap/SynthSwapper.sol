// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "synthetix/contracts/interfaces/ISynthetix.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "../interfaces/ISwap.sol";

/**
 * @title SynthSwapper
 * @notice Replacement of Virtual Synths in favor of gas savings. Allows swapping synths via the Synthetix protocol
 * or Saddle's pools. The `Bridge.sol` contract will deploy minimal clones of this contract upon initiating
 * any cross-asset swaps.
 */
contract SynthSwapper is Initializable {
    using SafeERC20 for IERC20;

    address payable owner;
    // SYNTHETIX points to `ProxyERC20` (0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F).
    // This contract is a proxy of `Synthetix` and is used to exchange synths.
    ISynthetix public constant SYNTHETIX =
        ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // "SADDLE" in bytes32 form
    bytes32 public constant TRACKING =
        0x534144444c450000000000000000000000000000000000000000000000000000;

    /**
     * @notice Initializes the contract when deploying this directly. This prevents
     * others from calling initialize() on the target contract and setting themself as the owner.
     */
    constructor() public {
        initialize();
    }

    /**
     * @notice This modifier checks if the caller is the owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "is not owner");
        _;
    }

    /**
     * @notice Sets the `owner` as the caller of this function
     */
    function initialize() public initializer {
        require(owner == address(0), "owner already set");
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
    ) external onlyOwner returns (uint256) {
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
     */
    function swapSynthToToken(
        ISwap swap,
        IERC20 tokenFrom,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 minAmount,
        uint256 deadline,
        address recipient
    ) external onlyOwner returns (IERC20, uint256) {
        tokenFrom.approve(address(swap), tokenFromAmount);
        swap.swap(
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            minAmount,
            deadline
        );
        IERC20 tokenTo = swap.getToken(tokenToIndex);
        uint256 balance = tokenTo.balanceOf(address(this));
        tokenTo.safeTransfer(recipient, balance);
        return (tokenTo, balance);
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
    ) external onlyOwner {
        token.safeTransfer(recipient, withdrawAmount);
        if (shouldDestroy) {
            _destroy();
        }
    }

    /**
     * @notice Destroys this contract. Only owner can call this function.
     */
    function destroy() external onlyOwner {
        _destroy();
    }

    function _destroy() internal {
        selfdestruct(msg.sender);
    }
}
