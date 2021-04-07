// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "../LPToken.sol";
import "../interfaces/ISwap.sol";
import "../interfaces/IMetaSwap.sol";

/**
 * @title SwapUtils library
 * @notice A library to be used within Swap.sol. Contains functions responsible for custody and AMM functionalities.
 * @dev Contracts relying on this library must initialize SwapUtils.Swap struct then use this library
 * for SwapUtils.Swap struct. Note that this library contains both functions called by users and admins.
 * Admin functions should be protected within contracts using this library.
 */
contract MetaSwapDeposit is Initializable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    ISwap public baseSwap;
    IMetaSwap public metaSwap;
    IERC20[] public baseTokens;
    IERC20[] public metaTokens;
    IERC20 public metaLPToken;

    uint256 constant MAX_UINT256 = 2**256 - 1;

    struct RemoveLiquidityImbalanceInfo {
        ISwap baseSwap;
        IMetaSwap metaSwap;
        IERC20 metaLPToken;
        uint8 baseLPTokenIndex;
        bool withdrawFromBase;
        uint256 leftoverMetaLPTokenAmount;
    }

    function initialize(
        ISwap baseSwap_,
        IMetaSwap metaSwap_,
        IERC20[] calldata baseTokens_,
        IERC20[] calldata metaTokens_,
        IERC20 metaLPToken_
    ) external initializer {
        // Check and approve base level tokens to be deposited to the base swap contract
        for (uint8 i = 0; i < baseTokens_.length; i++) {
            IERC20 baseToken = baseTokens_[i];
            require(IERC20(baseSwap_.getToken(i)) == baseToken);
            baseToken.approve(address(baseSwap_), MAX_UINT256);
        }

        // Check and approve meta level tokens to be deposited to the meta swap contract
        for (uint8 i = 0; i < metaTokens_.length; i++) {
            IERC20 metaToken = metaTokens_[i];
            require(IERC20(metaSwap_.getToken(i)) == metaToken);
            metaToken.approve(address(metaSwap_), MAX_UINT256);
        }

        // Approve base swap LP token to be burned by the base swap contract for withdrawing
        metaTokens_[metaTokens_.length - 1].approve(
            address(baseSwap_),
            MAX_UINT256
        );
        // Approve meta swap LP token to be burned by the meta swap contract for withdrawing
        metaLPToken.approve(address(metaSwap_), MAX_UINT256);

        // Initialize storage variables
        baseSwap = baseSwap_;
        metaSwap = metaSwap_;
        baseTokens = baseTokens_;
        metaTokens = metaTokens_;
        metaLPToken = metaLPToken_;
    }

    // Mutative functions

    /**
     * @notice Add liquidity to the pool with the given amounts of tokens
     * @param amounts the amounts of each token to add, in their native precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     * should mint, otherwise revert. Handy for front-running mitigation
     * @param deadline latest timestamp to accept this transaction
     * @return amount of LP token user minted and received
     */
    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256) {
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;
        uint256 baseLPTokenIndex = memMetaTokens.length - 1;

        require(amounts.length == memBaseTokens.length + baseLPTokenIndex);

        uint256 baseLPTokenAmount;
        {
            // Transfer base tokens from the caller and deposit to the base swap pool
            uint256[] memory baseAmounts = new uint256[](memBaseTokens.length);
            for (uint8 i = 0; i < amounts.length; i++) {
                IERC20 token = memBaseTokens[i];
                uint256 depositAmount = amounts[baseLPTokenIndex + i];
                token.safeTransferFrom(
                    msg.sender,
                    address(this),
                    depositAmount
                );
                baseAmounts[i] = token.balanceOf(address(this)); // account for any fees on transfer
            }
            baseLPTokenAmount = baseSwap.addLiquidity(baseAmounts, 0, deadline);
        }

        uint256 metaLPTokenAmount;
        {
            // Transfer remaining meta level tokens from the caller and deposit to the meta swap pool
            uint256[] memory metaAmounts = new uint256[](metaTokens.length);
            for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                IERC20 token = memMetaTokens[i];
                uint256 depositAmount = amounts[i];
                token.safeTransferFrom(
                    msg.sender,
                    address(this),
                    depositAmount
                );
                metaAmounts[i] = token.balanceOf(address(this)); // account for any fees on transfer
            }
            metaAmounts[baseLPTokenIndex] = baseLPTokenAmount;
            metaLPTokenAmount = metaSwap.addLiquidity(
                metaAmounts,
                minToMint,
                deadline
            );
        }

        // Transfer the meta lp token to the caller
        metaLPToken.safeTransfer(msg.sender, metaLPTokenAmount);

        return metaLPTokenAmount;
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool. Withdraw fee that decays linearly
     * over period of 4 weeks since last deposit will apply.
     * @dev Liquidity can always be removed, even when the pool is paused.
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
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;

        require(
            minAmounts.length ==
                memBaseTokens.length + memMetaTokens.length - 1,
            "out of range"
        );
        uint256[] memory totalRemovedAmounts = new uint256[](minAmounts.length);

        // Transfer meta lp token from the caller to this
        metaLPToken.safeTransferFrom(msg.sender, address(this), amount);

        {
            // Remove liquidity from the meta swap pool
            uint256[] memory metaRemovedAmounts;
            uint256 baseLPTokenIndex = memMetaTokens.length - 1;
            {
                uint256[] memory metaMinAmounts =
                    new uint256[](memMetaTokens.length);
                for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                    metaMinAmounts[i] = minAmounts[i];
                }
                metaRemovedAmounts = metaSwap.removeLiquidity(
                    amount,
                    metaMinAmounts,
                    deadline
                );
            }
            for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                totalRemovedAmounts[i] = metaRemovedAmounts[i];
            }

            // Remove liquidity from the base swap pool
            uint256[] memory baseRemovedAmounts;
            {
                uint256[] memory baseMinAmounts =
                    new uint256[](memBaseTokens.length);
                for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                    baseMinAmounts[i] = minAmounts[baseLPTokenIndex + i];
                }
                metaRemovedAmounts = baseSwap.removeLiquidity(
                    amount,
                    baseMinAmounts,
                    deadline
                );
            }
            for (uint8 i = 0; i < baseRemovedAmounts.length; i++) {
                totalRemovedAmounts[baseLPTokenIndex + i] = baseRemovedAmounts[
                    i
                ];
            }
        }

        return totalRemovedAmounts;
    }

    /**
     * @notice Remove liquidity from the pool all in one token. Withdraw fee that decays linearly
     * over period of 4 weeks since last deposit will apply.
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
        uint8 baseLPTokenIndex = uint8(metaTokens.length - 1);
        uint8 baseTokensLength = uint8(baseTokens.length);

        if (tokenIndex < baseLPTokenIndex) {
            return
                metaSwap.removeLiquidityOneToken(
                    tokenAmount,
                    tokenIndex,
                    minAmount,
                    deadline
                );
        } else if (tokenIndex < baseLPTokenIndex + baseTokensLength) {
            uint256 removedBaseLPTokenAmount =
                metaSwap.removeLiquidityOneToken(
                    tokenAmount,
                    baseLPTokenIndex,
                    0,
                    deadline
                );
            return
                baseSwap.removeLiquidityOneToken(
                    removedBaseLPTokenAmount,
                    tokenIndex - baseLPTokenIndex,
                    minAmount,
                    deadline
                );
        } else {
            revert("out of range");
        }
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     * pool's current balances. Withdraw fee that decays linearly
     * over period of 4 weeks since last deposit will apply.
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
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;
        uint256[] memory metaAmounts = new uint256[](memMetaTokens.length);
        uint256[] memory baseAmounts = new uint256[](memBaseTokens.length);

        RemoveLiquidityImbalanceInfo memory v =
            RemoveLiquidityImbalanceInfo(
                baseSwap,
                metaSwap,
                metaLPToken,
                uint8(metaAmounts.length - 1),
                false,
                0
            );

        for (uint8 i = 0; i < v.baseLPTokenIndex; i++) {
            metaAmounts[i] = amounts[i];
        }

        for (uint8 i = 0; i < baseAmounts.length; i++) {
            baseAmounts[i] = amounts[v.baseLPTokenIndex + i];
            if (baseAmounts[i] > 0) {
                v.withdrawFromBase = true;
            }
        }

        // Calculate how much base LP token we need to get the desired amount of underlying tokens
        if (v.withdrawFromBase) {
            metaAmounts[v.baseLPTokenIndex] = v.baseSwap.calculateTokenAmount(
                address(this),
                baseAmounts,
                false
            );
        }

        // Withdraw the paired meta level tokens and the base LP token from the meta swap pool
        v.metaSwap.removeLiquidityImbalance(
            metaAmounts,
            maxBurnAmount,
            deadline
        );

        // If underlying tokens are desired, withdraw them from the base swap pool
        if (v.withdrawFromBase) {
            v.baseSwap.removeLiquidityImbalance(
                baseAmounts,
                metaAmounts[v.baseLPTokenIndex],
                deadline
            );

            // Base swap may require LESS base LP token than the amount we have
            // In that case, deposit it to the meta swap pool.
            uint256[] memory leftovers = new uint256[](metaAmounts.length);
            IERC20 baseLPToken = memMetaTokens[v.baseLPTokenIndex];
            uint256 leftoverBaseLPTokenAmount =
                baseLPToken.balanceOf(address(this));
            if (leftoverBaseLPTokenAmount > 0) {
                leftovers[v.baseLPTokenIndex] = leftoverBaseLPTokenAmount;
                v.leftoverMetaLPTokenAmount = v.metaSwap.addLiquidity(
                    leftovers,
                    0,
                    deadline
                );
            }
        }

        // Transfer all withdrawn tokens to the caller
        for (uint8 i = 0; i < amounts.length; i++) {
            IERC20 token;
            if (i < v.baseLPTokenIndex) {
                token = memMetaTokens[i];
            } else {
                token = memBaseTokens[i - v.baseLPTokenIndex];
            }
            if (amounts[i] > 0) {
                token.safeTransfer(msg.sender, amounts[i]);
            }
        }

        // If there were any extra meta lp token, transfer them back to the caller as well
        if (v.leftoverMetaLPTokenAmount > 0) {
            v.metaLPToken.safeTransfer(msg.sender, v.leftoverMetaLPTokenAmount);
        }

        return maxBurnAmount - v.leftoverMetaLPTokenAmount;
    }

    // VIEW FUNCTIONS

    /**
     * @notice A simple method to calculate prices from deposits or
     * withdrawals, excluding fees but including slippage. This is
     * helpful as an input into the various "min" parameters on calls
     * to fight front-running
     *
     * @dev This shouldn't be used outside frontends for user estimates.
     *
     * @param account address that is depositing or withdrawing tokens
     * @param amounts an array of token amounts to deposit or withdrawal,
     * corresponding to pooledTokens. The amount should be in each
     * pooled token's native precision. If a token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param deposit whether this is a deposit or a withdrawal
     * @return token amount the user will receive
     */
    function calculateTokenAmount(
        address account,
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256) {
        account = address(this);
        uint256[] memory metaAmounts = new uint256[](metaTokens.length);
        uint256[] memory baseAmounts = new uint256[](baseTokens.length);
        uint256 baseLPTokenIndex = metaAmounts.length - 1;

        for (uint8 i = 0; i < baseLPTokenIndex; i++) {
            metaAmounts[i] = amounts[i];
        }

        for (uint8 i = 0; i < baseAmounts.length; i++) {
            baseAmounts[i] = amounts[baseLPTokenIndex + i];
        }

        uint256 baseLPTokenAmount =
            baseSwap.calculateTokenAmount(account, baseAmounts, deposit);
        metaAmounts[baseLPTokenIndex] = baseLPTokenAmount;

        return metaSwap.calculateTokenAmount(account, metaAmounts, deposit);
    }

    /**
     * @notice A simple method to calculate amount of each underlying
     * tokens that is returned upon burning given amount of LP tokens
     * @param account the address that is withdrawing tokens
     * @param amount the amount of LP tokens that would be burned on withdrawal
     * @return array of token balances that the user will receive
     */
    function calculateRemoveLiquidity(address account, uint256 amount)
        external
        view
        returns (uint256[] memory)
    {
        account = address(this); // overwrite account
        uint256[] memory metaAmounts =
            metaSwap.calculateRemoveLiquidity(account, amount);
        uint8 baseLPTokenIndex = uint8(metaAmounts.length - 1);
        uint256[] memory baseAmounts =
            baseSwap.calculateRemoveLiquidity(
                account,
                metaAmounts[baseLPTokenIndex]
            );

        uint256[] memory totalAmounts =
            new uint256[](baseLPTokenIndex + baseAmounts.length);
        for (uint8 i = 0; i < baseLPTokenIndex; i++) {
            totalAmounts[i] = metaAmounts[i];
        }
        for (uint8 i = 0; i < baseAmounts.length; i++) {
            totalAmounts[baseLPTokenIndex + i] = baseAmounts[i];
        }

        return totalAmounts;
    }

    /**
     * @notice Calculate the amount of underlying token available to withdraw
     * when withdrawing via only single token
     * @param account the address that is withdrawing tokens
     * @param tokenAmount the amount of LP token to burn
     * @param tokenIndex index of which token will be withdrawn
     * @return availableTokenAmount calculated amount of underlying token
     * available to withdraw
     */
    function calculateRemoveLiquidityOneToken(
        address account,
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256) {
        account = address(this); // overwrite account
        uint8 baseLPTokenIndex = uint8(metaTokens.length - 1);

        if (tokenIndex < baseLPTokenIndex) {
            return
                metaSwap.calculateRemoveLiquidityOneToken(
                    account,
                    tokenAmount,
                    tokenIndex
                );
        } else {
            uint256 baseLPTokenAmount =
                metaSwap.calculateRemoveLiquidityOneToken(
                    account,
                    tokenAmount,
                    baseLPTokenIndex
                );
            return
                baseSwap.calculateRemoveLiquidityOneToken(
                    account,
                    baseLPTokenAmount,
                    tokenIndex - baseLPTokenIndex
                );
        }
    }
}
