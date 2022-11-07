// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable-4.7.3/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable-4.7.3/security/ReentrancyGuardUpgradeable.sol";
import "../LPTokenV2.sol";
import "../interfaces/ISwapV2.sol";
import "../interfaces/IMetaSwapV1.sol";

/**
 * @title MetaSwapDeposit
 * @notice This contract flattens the LP token in a MetaSwap pool for easier user access. MetaSwap must be
 * deployed before this contract can be initialized successfully.
 *
 * For example, suppose there exists a base Swap pool consisting of [DAI, USDC, USDT].
 * Then a MetaSwap pool can be created with [sUSD, BaseSwapLPToken] to allow trades between either
 * the LP token or the underlying tokens and sUSD.
 *
 * MetaSwapDeposit flattens the LP token and remaps them to a single array, allowing users
 * to ignore the dependency on BaseSwapLPToken. Using the above example, MetaSwapDeposit can act
 * as a Swap containing [sUSD, DAI, USDC, USDT] tokens.
 */
contract MetaSwapDepositV1 is Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    ISwapV2 public baseSwap;
    IMetaSwapV1 public metaSwap;
    IERC20[] public baseTokens;
    IERC20[] public metaTokens;
    IERC20[] public tokens;
    IERC20 public metaLPToken;

    uint256 constant MAX_UINT256 = 2**256 - 1;

    struct RemoveLiquidityImbalanceInfo {
        ISwapV2 baseSwap;
        IMetaSwapV1 metaSwap;
        IERC20 metaLPToken;
        uint8 baseLPTokenIndex;
        bool withdrawFromBase;
        uint256 leftoverMetaLPTokenAmount;
    }

    /**
     * @notice Sets the address for the base Swap contract, MetaSwap contract, and the
     * MetaSwap LP token contract.
     * @param _baseSwap the address of the base Swap contract
     * @param _metaSwap the address of the MetaSwap contract
     * @param _metaLPToken the address of the MetaSwap LP token contract
     */
    function initialize(
        ISwapV2 _baseSwap,
        IMetaSwapV1 _metaSwap,
        IERC20 _metaLPToken
    ) external initializer {
        __ReentrancyGuard_init();
        // Check and approve base level tokens to be deposited to the base Swap contract
        {
            uint8 i;
            for (; i < 32; i++) {
                try _baseSwap.getToken(i) returns (IERC20 token) {
                    baseTokens.push(token);
                    token.safeApprove(address(_baseSwap), MAX_UINT256);
                    token.safeApprove(address(_metaSwap), MAX_UINT256);
                } catch {
                    break;
                }
            }
            require(i > 1, "baseSwap must have at least 2 tokens");
        }

        // Check and approve meta level tokens to be deposited to the MetaSwap contract
        IERC20 baseLPToken;
        {
            uint8 i;
            for (; i < 32; i++) {
                try _metaSwap.getToken(i) returns (IERC20 token) {
                    baseLPToken = token;
                    metaTokens.push(token);
                    tokens.push(token);
                    token.safeApprove(address(_metaSwap), MAX_UINT256);
                } catch {
                    break;
                }
            }
            require(i > 1, "metaSwap must have at least 2 tokens");
        }

        // Flatten baseTokens and append it to tokens array
        tokens[tokens.length - 1] = baseTokens[0];
        for (uint8 i = 1; i < baseTokens.length; i++) {
            tokens.push(baseTokens[i]);
        }

        // Approve base Swap LP token to be burned by the base Swap contract for withdrawing
        baseLPToken.safeApprove(address(_baseSwap), MAX_UINT256);
        // Approve MetaSwap LP token to be burned by the MetaSwap contract for withdrawing
        _metaLPToken.safeApprove(address(_metaSwap), MAX_UINT256);

        // Initialize storage variables
        baseSwap = _baseSwap;
        metaSwap = _metaSwap;
        metaLPToken = _metaLPToken;
    }

    // Mutative functions

    /**
     * @notice Swap two underlying tokens using the meta pool and the base pool
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
    ) external nonReentrant returns (uint256) {
        tokens[tokenIndexFrom].safeTransferFrom(msg.sender, address(this), dx);
        uint256 tokenToAmount = metaSwap.swapUnderlying(
            tokenIndexFrom,
            tokenIndexTo,
            dx,
            minDy,
            deadline
        );
        tokens[tokenIndexTo].safeTransfer(msg.sender, tokenToAmount);
        return tokenToAmount;
    }

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
    ) external nonReentrant returns (uint256) {
        // Read to memory to save on gas
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;
        uint256 baseLPTokenIndex = memMetaTokens.length - 1;

        require(amounts.length == memBaseTokens.length + baseLPTokenIndex);

        uint256 baseLPTokenAmount;
        {
            // Transfer base tokens from the caller and deposit to the base Swap pool
            uint256[] memory baseAmounts = new uint256[](memBaseTokens.length);
            bool shouldDepositBaseTokens;
            for (uint8 i = 0; i < memBaseTokens.length; i++) {
                IERC20 token = memBaseTokens[i];
                uint256 depositAmount = amounts[baseLPTokenIndex + i];
                if (depositAmount > 0) {
                    token.safeTransferFrom(
                        msg.sender,
                        address(this),
                        depositAmount
                    );
                    baseAmounts[i] = token.balanceOf(address(this)); // account for any fees on transfer
                    // if there are any base Swap level tokens, flag it for deposits
                    shouldDepositBaseTokens = true;
                }
            }
            if (shouldDepositBaseTokens) {
                // Deposit any base Swap level tokens and receive baseLPToken
                baseLPTokenAmount = baseSwap.addLiquidity(
                    baseAmounts,
                    0,
                    deadline
                );
            }
        }

        uint256 metaLPTokenAmount;
        {
            // Transfer remaining meta level tokens from the caller
            uint256[] memory metaAmounts = new uint256[](metaTokens.length);
            for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                IERC20 token = memMetaTokens[i];
                uint256 depositAmount = amounts[i];
                if (depositAmount > 0) {
                    token.safeTransferFrom(
                        msg.sender,
                        address(this),
                        depositAmount
                    );
                    metaAmounts[i] = token.balanceOf(address(this)); // account for any fees on transfer
                }
            }
            // Update the baseLPToken amount that will be deposited
            metaAmounts[baseLPTokenIndex] = baseLPTokenAmount;

            // Deposit the meta level tokens and the baseLPToken
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
    ) external nonReentrant returns (uint256[] memory) {
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;
        uint256[] memory totalRemovedAmounts;

        {
            uint256 numOfAllTokens = memBaseTokens.length +
                memMetaTokens.length -
                1;
            require(minAmounts.length == numOfAllTokens, "out of range");
            totalRemovedAmounts = new uint256[](numOfAllTokens);
        }

        // Transfer meta lp token from the caller to this
        metaLPToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 baseLPTokenAmount;
        {
            // Remove liquidity from the MetaSwap pool
            uint256[] memory removedAmounts;
            uint256 baseLPTokenIndex = memMetaTokens.length - 1;
            {
                uint256[] memory metaMinAmounts = new uint256[](
                    memMetaTokens.length
                );
                for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                    metaMinAmounts[i] = minAmounts[i];
                }
                removedAmounts = metaSwap.removeLiquidity(
                    amount,
                    metaMinAmounts,
                    deadline
                );
            }

            // Send the meta level tokens to the caller
            for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                totalRemovedAmounts[i] = removedAmounts[i];
                memMetaTokens[i].safeTransfer(msg.sender, removedAmounts[i]);
            }
            baseLPTokenAmount = removedAmounts[baseLPTokenIndex];

            // Remove liquidity from the base Swap pool
            {
                uint256[] memory baseMinAmounts = new uint256[](
                    memBaseTokens.length
                );
                for (uint8 i = 0; i < baseLPTokenIndex; i++) {
                    baseMinAmounts[i] = minAmounts[baseLPTokenIndex + i];
                }
                removedAmounts = baseSwap.removeLiquidity(
                    baseLPTokenAmount,
                    baseMinAmounts,
                    deadline
                );
            }

            // Send the base level tokens to the caller
            for (uint8 i = 0; i < memBaseTokens.length; i++) {
                totalRemovedAmounts[baseLPTokenIndex + i] = removedAmounts[i];
                memBaseTokens[i].safeTransfer(msg.sender, removedAmounts[i]);
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
    ) external nonReentrant returns (uint256) {
        uint8 baseLPTokenIndex = uint8(metaTokens.length - 1);
        uint8 baseTokensLength = uint8(baseTokens.length);

        // Transfer metaLPToken from the caller
        metaLPToken.safeTransferFrom(msg.sender, address(this), tokenAmount);

        IERC20 token;
        if (tokenIndex < baseLPTokenIndex) {
            // When the desired token is meta level token, we can just call `removeLiquidityOneToken` directly
            metaSwap.removeLiquidityOneToken(
                tokenAmount,
                tokenIndex,
                minAmount,
                deadline
            );
            token = metaTokens[tokenIndex];
        } else if (tokenIndex < baseLPTokenIndex + baseTokensLength) {
            // When the desired token is a base level token, we need to first withdraw via baseLPToken, then withdraw
            // the desired token from the base Swap contract.
            uint256 removedBaseLPTokenAmount = metaSwap.removeLiquidityOneToken(
                tokenAmount,
                baseLPTokenIndex,
                0,
                deadline
            );

            baseSwap.removeLiquidityOneToken(
                removedBaseLPTokenAmount,
                tokenIndex - baseLPTokenIndex,
                minAmount,
                deadline
            );
            token = baseTokens[tokenIndex - baseLPTokenIndex];
        } else {
            revert("out of range");
        }

        uint256 amountWithdrawn = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, amountWithdrawn);
        return amountWithdrawn;
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
    ) external nonReentrant returns (uint256) {
        IERC20[] memory memBaseTokens = baseTokens;
        IERC20[] memory memMetaTokens = metaTokens;
        uint256[] memory metaAmounts = new uint256[](memMetaTokens.length);
        uint256[] memory baseAmounts = new uint256[](memBaseTokens.length);

        require(
            amounts.length == memBaseTokens.length + memMetaTokens.length - 1,
            "out of range"
        );

        RemoveLiquidityImbalanceInfo memory v = RemoveLiquidityImbalanceInfo(
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
            metaAmounts[v.baseLPTokenIndex] =
                (v.baseSwap.calculateTokenAmount(baseAmounts, false) * 10005) /
                10000;
        }

        // Transfer MetaSwap LP token from the caller to this contract
        v.metaLPToken.safeTransferFrom(
            msg.sender,
            address(this),
            maxBurnAmount
        );

        // Withdraw the paired meta level tokens and the base LP token from the MetaSwap pool
        uint256 burnedMetaLPTokenAmount = v.metaSwap.removeLiquidityImbalance(
            metaAmounts,
            maxBurnAmount,
            deadline
        );
        v.leftoverMetaLPTokenAmount = maxBurnAmount - burnedMetaLPTokenAmount;

        // If underlying tokens are desired, withdraw them from the base Swap pool
        if (v.withdrawFromBase) {
            v.baseSwap.removeLiquidityImbalance(
                baseAmounts,
                metaAmounts[v.baseLPTokenIndex],
                deadline
            );

            // Base Swap may require LESS base LP token than the amount we have
            // In that case, deposit it to the MetaSwap pool.
            uint256[] memory leftovers = new uint256[](metaAmounts.length);
            IERC20 baseLPToken = memMetaTokens[v.baseLPTokenIndex];
            uint256 leftoverBaseLPTokenAmount = baseLPToken.balanceOf(
                address(this)
            );
            if (leftoverBaseLPTokenAmount > 0) {
                leftovers[v.baseLPTokenIndex] = leftoverBaseLPTokenAmount;
                v.leftoverMetaLPTokenAmount =
                    v.leftoverMetaLPTokenAmount +
                    v.metaSwap.addLiquidity(leftovers, 0, deadline);
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
     * to fight front-running. When withdrawing from the base pool in imbalanced
     * fashion, the recommended slippage setting is 0.2% or higher.
     *
     * @dev This shouldn't be used outside frontends for user estimates.
     *
     * @param amounts an array of token amounts to deposit or withdrawal,
     * corresponding to pooledTokens. The amount should be in each
     * pooled token's native precision. If a token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param deposit whether this is a deposit or a withdrawal
     * @return token amount the user will receive
     */
    function calculateTokenAmount(uint256[] calldata amounts, bool deposit)
        external
        view
        returns (uint256)
    {
        uint256[] memory metaAmounts = new uint256[](metaTokens.length);
        uint256[] memory baseAmounts = new uint256[](baseTokens.length);
        uint256 baseLPTokenIndex = metaAmounts.length - 1;

        for (uint8 i = 0; i < baseLPTokenIndex; i++) {
            metaAmounts[i] = amounts[i];
        }

        for (uint8 i = 0; i < baseAmounts.length; i++) {
            baseAmounts[i] = amounts[baseLPTokenIndex + i];
        }

        uint256 baseLPTokenAmount = baseSwap.calculateTokenAmount(
            baseAmounts,
            deposit
        );
        metaAmounts[baseLPTokenIndex] = baseLPTokenAmount;

        return metaSwap.calculateTokenAmount(metaAmounts, deposit);
    }

    /**
     * @notice A simple method to calculate amount of each underlying
     * tokens that is returned upon burning given amount of LP tokens
     * @param amount the amount of LP tokens that would be burned on withdrawal
     * @return array of token balances that the user will receive
     */
    function calculateRemoveLiquidity(uint256 amount)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory metaAmounts = metaSwap.calculateRemoveLiquidity(
            amount
        );
        uint8 baseLPTokenIndex = uint8(metaAmounts.length - 1);
        uint256[] memory baseAmounts = baseSwap.calculateRemoveLiquidity(
            metaAmounts[baseLPTokenIndex]
        );

        uint256[] memory totalAmounts = new uint256[](
            baseLPTokenIndex + baseAmounts.length
        );
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
     * @param tokenAmount the amount of LP token to burn
     * @param tokenIndex index of which token will be withdrawn
     * @return availableTokenAmount calculated amount of underlying token
     * available to withdraw
     */
    function calculateRemoveLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256) {
        uint8 baseLPTokenIndex = uint8(metaTokens.length - 1);

        if (tokenIndex < baseLPTokenIndex) {
            return
                metaSwap.calculateRemoveLiquidityOneToken(
                    tokenAmount,
                    tokenIndex
                );
        } else {
            uint256 baseLPTokenAmount = metaSwap
                .calculateRemoveLiquidityOneToken(
                    tokenAmount,
                    baseLPTokenIndex
                );
            return
                baseSwap.calculateRemoveLiquidityOneToken(
                    baseLPTokenAmount,
                    tokenIndex - baseLPTokenIndex
                );
        }
    }

    /**
     * @notice Returns the address of the pooled token at given index. Reverts if tokenIndex is out of range.
     * This is a flattened representation of the pooled tokens.
     * @param index the index of the token
     * @return address of the token at given index
     */
    function getToken(uint8 index) external view returns (IERC20) {
        require(index < tokens.length, "index out of range");
        return tokens[index];
    }

    /**
     * @notice Calculate amount of tokens you receive on swap
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell. If the token charges
     * a fee on transfers, use the amount that gets transferred after the fee.
     * @return amount of tokens the user will receive
     */
    function calculateSwap(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx
    ) external view returns (uint256) {
        return
            metaSwap.calculateSwapUnderlying(tokenIndexFrom, tokenIndexTo, dx);
    }
}
