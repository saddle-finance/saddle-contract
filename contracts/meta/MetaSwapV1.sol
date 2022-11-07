// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../SwapV2.sol";
import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "./MetaSwapUtilsV1.sol";

/**
 * @title MetaSwap - A StableSwap implementation in solidity.
 * @notice This contract is responsible for custody of closely pegged assets (eg. group of stablecoins)
 * and automatic market making system. Users become an LP (Liquidity Provider) by depositing their tokens
 * in desired ratios for an exchange of the pool token that represents their share of the pool.
 * Users can burn pool tokens and withdraw their share of token(s).
 *
 * Each time a swap between the pooled tokens happens, a set fee incurs which effectively gets
 * distributed to the LPs.
 *
 * In case of emergencies, admin can pause additional deposits, swaps, or single-asset withdraws - which
 * stops the ratio of the tokens in the pool from changing.
 * Users can always withdraw their tokens via multi-asset withdraws.
 *
 * MetaSwap is a modified version of Swap that allows Swap's LP token to be utilized in pooling with other tokens.
 * As an example, if there is a Swap pool consisting of [DAI, USDC, USDT], then a MetaSwap pool can be created
 * with [sUSD, BaseSwapLPToken] to allow trades between either the LP token or the underlying tokens and sUSD.
 * Note that when interacting with MetaSwap, users cannot deposit or withdraw via underlying tokens. In that case,
 * `MetaSwapDeposit.sol` can be additionally deployed to allow interacting with unwrapped representations of the tokens.
 *
 * @dev Most of the logic is stored as a library `MetaSwapUtils` for the sake of reducing contract's
 * deployment size.
 */
contract MetaSwapV1 is SwapV2 {
    using MetaSwapUtilsV1 for SwapUtilsV2.Swap;
    using SafeERC20 for IERC20; //TODO: is this needed? wont compile without it

    MetaSwapUtilsV1.MetaSwap public metaSwapStorage;

    uint256 constant MAX_UINT256 = 2**256 - 1;

    /*** EVENTS ***/

    // events replicated from SwapUtils to make the ABI easier for dumb
    // clients
    event TokenSwapUnderlying(
        address indexed buyer,
        uint256 tokensSold,
        uint256 tokensBought,
        uint128 soldId,
        uint128 boughtId
    );

    /**
     * @notice Get the virtual price, to help calculate profit
     * @return the virtual price, scaled to the POOL_PRECISION_DECIMALS
     */
    function getVirtualPrice()
        external
        view
        virtual
        override
        returns (uint256)
    {
        return MetaSwapUtilsV1.getVirtualPrice(swapStorage, metaSwapStorage);
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
    ) external view virtual override returns (uint256) {
        return
            MetaSwapUtilsV1.calculateSwap(
                swapStorage,
                metaSwapStorage,
                tokenIndexFrom,
                tokenIndexTo,
                dx
            );
    }

    /**
     * @notice Calculate amount of tokens you receive on swap. For this function,
     * the token indices are flattened out so that underlying tokens are represented.
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell. If the token charges
     * a fee on transfers, use the amount that gets transferred after the fee.
     * @return amount of tokens the user will receive
     */
    function calculateSwapUnderlying(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx
    ) external view virtual returns (uint256) {
        return
            MetaSwapUtilsV1.calculateSwapUnderlying(
                swapStorage,
                metaSwapStorage,
                tokenIndexFrom,
                tokenIndexTo,
                dx
            );
    }

    /**
     * @notice A simple method to calculate prices from deposits or
     * withdrawals, excluding fees but including slippage. This is
     * helpful as an input into the various "min" parameters on calls
     * to fight front-running
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
        virtual
        override
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.calculateTokenAmount(
                swapStorage,
                metaSwapStorage,
                amounts,
                deposit
            );
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
    ) external view virtual override returns (uint256) {
        return
            MetaSwapUtilsV1.calculateWithdrawOneToken(
                swapStorage,
                metaSwapStorage,
                tokenAmount,
                tokenIndex
            );
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice This overrides Swap's initialize function to prevent initializing
     * without the address of the base Swap contract.
     *
     * @param _pooledTokens an array of ERC20s this pool will accept
     * @param decimals the decimals to use for each pooled token,
     * eg 8 for WBTC. Cannot be larger than POOL_PRECISION_DECIMALS
     * @param lpTokenName the long-form name of the token to be deployed
     * @param lpTokenSymbol the short symbol for the token to be deployed
     * @param _a the amplification coefficient * n * (n - 1). See the
     * StableSwap paper for details
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     */
    function initialize(
        IERC20[] memory _pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress
    ) public payable virtual override initializer {
        revert("use initializeMetaSwap() instead");
    }

    /**
     * @notice Initializes this MetaSwap contract with the given parameters.
     * MetaSwap uses an existing Swap pool to expand the available liquidity.
     * _pooledTokens array should contain the base Swap pool's LP token as
     * the last element. For example, if there is a Swap pool consisting of
     * [DAI, USDC, USDT]. Then a MetaSwap pool can be created with [sUSD, BaseSwapLPToken]
     * as _pooledTokens.
     *
     * This will also deploy the LPToken that represents users'
     * LP position. The owner of LPToken will be this contract - which means
     * only this contract is allowed to mint new tokens.
     *
     * @param _pooledTokens an array of ERC20s this pool will accept. The last
     * element must be an existing Swap pool's LP token's address.
     * @param decimals the decimals to use for each pooled token,
     * eg 8 for WBTC. Cannot be larger than POOL_PRECISION_DECIMALS
     * @param lpTokenName the long-form name of the token to be deployed
     * @param lpTokenSymbol the short symbol for the token to be deployed
     * @param _a the amplification coefficient * n * (n - 1). See the
     * StableSwap paper for details
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     */
    function initializeMetaSwap(
        IERC20[] memory _pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress,
        ISwapV2 baseSwap
    ) public payable virtual initializer {
        __SwapV2_init(
            _pooledTokens,
            decimals,
            lpTokenName,
            lpTokenSymbol,
            _a,
            _fee,
            _adminFee,
            lpTokenTargetAddress
        );

        // MetaSwap initializer
        metaSwapStorage.baseSwap = baseSwap;
        metaSwapStorage.baseVirtualPrice = baseSwap.getVirtualPrice();
        metaSwapStorage.baseCacheLastUpdated = block.timestamp;

        // Read all tokens that belong to baseSwap
        {
            uint8 i;
            for (; i < 32; i++) {
                try baseSwap.getToken(i) returns (IERC20 token) {
                    metaSwapStorage.baseTokens.push(token);
                    token.safeApprove(address(baseSwap), MAX_UINT256);
                } catch {
                    break;
                }
            }
            require(i > 1, "baseSwap must pool at least 2 tokens");
        }

        // Check the last element of _pooledTokens is owned by baseSwap
        IERC20 baseLPToken = _pooledTokens[_pooledTokens.length - 1];
        require(
            LPTokenV2(address(baseLPToken)).owner() == address(baseSwap),
            "baseLPToken is not owned by baseSwap"
        );

        // Pre-approve the baseLPToken to be used by baseSwap
        baseLPToken.safeApprove(address(baseSwap), MAX_UINT256);
    }

    /**
     * @notice Swap two tokens using this pool
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
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        deadlineCheck(deadline)
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.swap(
                swapStorage,
                metaSwapStorage,
                tokenIndexFrom,
                tokenIndexTo,
                dx,
                minDy
            );
    }

    /**
     * @notice Swap two tokens using this pool and the base pool.
     * @param tokenIndexFrom the token the user wants to swap from
     * @param tokenIndexTo the token the user wants to swap to
     * @param dx the amount of tokens the user wants to swap from
     * @param minDy the min amount the user would like to receive, or revert.
     * @param deadline latest timestamp to accept this transaction
     */
    function swapUnderlying(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    )
        external
        virtual
        nonReentrant
        whenNotPaused
        deadlineCheck(deadline)
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.swapUnderlying(
                swapStorage,
                metaSwapStorage,
                tokenIndexFrom,
                tokenIndexTo,
                dx,
                minDy
            );
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
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        deadlineCheck(deadline)
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.addLiquidity(
                swapStorage,
                metaSwapStorage,
                amounts,
                minToMint
            );
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
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        deadlineCheck(deadline)
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.removeLiquidityOneToken(
                swapStorage,
                metaSwapStorage,
                tokenAmount,
                tokenIndex,
                minAmount
            );
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
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        deadlineCheck(deadline)
        returns (uint256)
    {
        return
            MetaSwapUtilsV1.removeLiquidityImbalance(
                swapStorage,
                metaSwapStorage,
                amounts,
                maxBurnAmount
            );
    }
}
