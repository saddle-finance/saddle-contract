// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Swap.sol";
import "./interfaces/IWETH9.sol";

/**
 * @title SwapEthWrapper
 * @notice A wrapper contract for Swap contracts that have WETH as one of the pooled tokens.
 * @author Jongseung Lim (@weeb_mcgee)
 */
contract SwapEthWrapper {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    Swap public immutable swapInstance;
    LPToken public immutable lpToken;
    address payable public immutable weth;
    IERC20[] public pooledTokens;
    uint8 public immutable wethIndex;

    uint8 private constant MAX_UINT8 = 2**8 - 1;
    uint256 private constant MAX_UINT256 = 2**256 - 1;

    /**
     * @notice Deploys this contract with given WETH9 address and Swap address. It will attempt to
     * fetch information about the given Swap pool. If the Swap pool does not contain WETH9,
     * this call will be reverted.
     * @param wethAddress address to the WETH9 contract
     * @param swapAddress address to the Swap contract that has WETH9 as one of the tokens
     */
    constructor(address payable wethAddress, Swap swapAddress) public {
        (, , , , , , LPToken lpToken_) = swapAddress.swapStorage();
        uint8 wethIndex_ = MAX_UINT8;

        for (uint8 i = 0; i < 32; i++) {
            try swapAddress.getToken(i) returns (IERC20 token) {
                pooledTokens.push(token);
                if (address(token) == wethAddress) {
                    wethIndex_ = i;
                }
                // Approve pooled tokens to be used by Swap
                token.approve(address(swapAddress), MAX_UINT256);
            } catch {
                break;
            }
        }
        require(wethIndex_ != MAX_UINT8, "WETH was not found in the swap pool");
        // Set immutable variables
        wethIndex = wethIndex_;
        weth = wethAddress;
        swapInstance = swapAddress;
        lpToken = lpToken_;
        // Approve LPToken to be used by Swap
        lpToken_.approve(address(swapAddress), MAX_UINT256);
    }

    /**
     * @notice Add liquidity to the pool with the given amounts of tokens.
     * @dev The msg.value of this call should match the value in amounts array
     * in position of WETH9.
     * @param amounts the amounts of each token to add, in their native precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     * should mint, otherwise revert. Handy for front-running mitigation
     * @param deadline latest timestamp to accept this transaction
     * @return amount of LP token user minted and received
     */
    function addLiquidity(
        uint256[] memory amounts,
        uint256 minToMint,
        uint256 deadline
    ) external payable returns (uint256) {
        // If using ETH, deposit them to WETH.
        if (msg.value > 0) {
            IWETH9(weth).deposit{value: msg.value}();
        }
        require(msg.value == amounts[wethIndex], "INCORRECT_MSG_VALUE");
        // Go through amounts array and transfer respective tokens to this contract.
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amount = amounts[i];
            if (i != wethIndex && amount > 0) {
                pooledTokens[i].safeTransferFrom(
                    msg.sender,
                    address(this),
                    amount
                );
            }
        }
        // Add the assets to the pool
        uint256 lpTokenAmount =
            swapInstance.addLiquidity(amounts, minToMint, deadline);
        // Send the LPToken to msg.sender
        IERC20(address(lpToken)).safeTransfer(msg.sender, lpTokenAmount);
        return lpTokenAmount;
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool.
     * @dev Liquidity can always be removed, even when the pool is paused. Caller
     * will receive ETH instead of WETH9.
     * @param amount the amount of LP tokens to burn
     * @param minAmounts the minimum amounts of each token in the pool
     *        acceptable for this burn. Useful as a front-running mitigation
     * @param deadline latest timestamp to accept this transaction
     * @return amounts of tokens user received
     */
    function removeLiquidity(
        uint256 amount,
        uint256[] calldata minAmounts,
        uint256 deadline
    ) external returns (uint256[] memory) {
        // Transfer LPToken from msg.sender to this contract.
        IERC20(address(lpToken)).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        // Remove liquidity
        uint256[] memory amounts =
            swapInstance.removeLiquidity(amount, minAmounts, deadline);
        // Send the tokens back to the user
        for (uint256 i = 0; i < amounts.length; i++) {
            if (i != wethIndex) {
                pooledTokens[i].safeTransfer(msg.sender, amounts[i]);
            } else {
                IWETH9(weth).withdraw(amounts[i]);
                // slither-disable-next-line arbitrary-send
                (bool success, ) = msg.sender.call{value: amounts[i]}("");
                require(success, "ETH_TRANSFER_FAILED");
            }
        }
        return amounts;
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @dev Caller will receive ETH instead of WETH9.
     * @param tokenAmount the amount of the token you want to receive
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     * @param deadline latest timestamp to accept this transaction
     * @return amount of chosen token user received
     */
    function removeLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount,
        uint256 deadline
    ) external returns (uint256) {
        // Transfer LPToken from msg.sender to this contract.
        IERC20(address(lpToken)).safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        // Withdraw via single token
        uint256 amount =
            swapInstance.removeLiquidityOneToken(
                tokenAmount,
                tokenIndex,
                minAmount,
                deadline
            );
        // Transfer the token to msg.sender accordingly
        if (tokenIndex != wethIndex) {
            pooledTokens[tokenIndex].safeTransfer(msg.sender, amount);
        } else {
            IWETH9(weth).withdraw(amount);
            // slither-disable-next-line arbitrary-send
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH_TRANSFER_FAILED");
        }
        return amount;
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     * pool's current balances.
     * @dev Caller will receive ETH instead of WETH9.
     * @param amounts how much of each token to withdraw
     * @param maxBurnAmount the max LP token provider is willing to pay to
     * remove liquidity. Useful as a front-running mitigation.
     * @param deadline latest timestamp to accept this transaction
     * @return amount of LP tokens burned
     */
    function removeLiquidityImbalance(
        uint256[] calldata amounts,
        uint256 maxBurnAmount,
        uint256 deadline
    ) external returns (uint256) {
        // Transfer LPToken from msg.sender to this contract.
        IERC20(address(lpToken)).safeTransferFrom(
            msg.sender,
            address(this),
            maxBurnAmount
        );
        // Withdraw in imbalanced ratio
        uint256 burnedLpTokenAmount =
            swapInstance.removeLiquidityImbalance(
                amounts,
                maxBurnAmount,
                deadline
            );
        // Send the tokens back to the user
        for (uint256 i = 0; i < amounts.length; i++) {
            if (i != wethIndex) {
                pooledTokens[i].safeTransfer(msg.sender, amounts[i]);
            } else {
                IWETH9(weth).withdraw(amounts[i]);
                // slither-disable-next-line arbitrary-send
                (bool success, ) = msg.sender.call{value: amounts[i]}("");
                require(success, "ETH_TRANSFER_FAILED");
            }
        }
        // Send any extra LP tokens back as well
        uint256 extraLpTokenAmount = maxBurnAmount.sub(burnedLpTokenAmount);
        if (extraLpTokenAmount > 0) {
            IERC20(address(lpToken)).safeTransfer(
                msg.sender,
                extraLpTokenAmount
            );
        }
        return burnedLpTokenAmount;
    }

    /**
     * @notice Swap two tokens using the underlying pool. If tokenIndexFrom
     * represents WETH9 in the pool, the caller must set msg.value equal to dx.
     * If the user is swapping to WETH9 in the pool, the user will receive ETH instead.
     * @param tokenIndexFrom the token the user wants to swap from
     * @param tokenIndexTo the token the user wants to swap to
     * @param dx the amount of tokens the user wants to swap from
     * @param minDy the min amount the user would like to receive, or revert.
     * @param deadline latest timestamp to accept this transaction
     */
    function swap(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    ) external payable returns (uint256) {
        // Transfer tokens from msg.sender to this contract
        if (tokenIndexFrom != wethIndex) {
            IERC20(pooledTokens[tokenIndexFrom]).safeTransferFrom(
                msg.sender,
                address(this),
                dx
            );
        } else {
            IWETH9(weth).deposit{value: msg.value}();
            require(msg.value == dx, "INCORRECT_MSG_VALUE");
        }
        // Execute swap
        uint256 dy =
            swapInstance.swap(
                tokenIndexFrom,
                tokenIndexTo,
                dx,
                minDy,
                deadline
            );
        // Transfer the swapped tokens to msg.sender
        if (tokenIndexTo != wethIndex) {
            IERC20(pooledTokens[tokenIndexTo]).safeTransfer(msg.sender, dy);
        } else {
            IWETH9(weth).withdraw(dy);
            // slither-disable-next-line arbitrary-send
            (bool success, ) = msg.sender.call{value: dy}("");
            require(success, "ETH_TRANSFER_FAILED");
        }
        return dy;
    }

    /**
     * @notice Rescues any of the ETH, the pooled tokens, or the LPToken that may be stuck
     * in this contract.
     */
    function rescue() external {
        IERC20[] memory tokens = pooledTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            tokens[i].safeTransfer(
                msg.sender,
                tokens[i].balanceOf(address(this))
            );
        }
        IERC20 lpToken_ = IERC20(address(lpToken));
        lpToken_.safeTransfer(msg.sender, lpToken_.balanceOf(address(this)));
        // slither-disable-next-line arbitrary-send
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "ETH_TRANSFER_FAILED");
    }

    receive() external payable {}
}
