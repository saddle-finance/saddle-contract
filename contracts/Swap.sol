pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OwnerPausable.sol";
import "./SwapUtils.sol";
import "./MathUtils.sol";

contract Swap is OwnerPausable, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using MathUtils for uint256;
    using SwapUtils for SwapUtils.Swap;

    SwapUtils.Swap public swapStorage;

    // events replicated fromm SwapUtils to make the ABI easier for dumb
    // clients
    event TokenSwap(address indexed buyer, uint256 tokensSold,
        uint256 tokensBought, uint128 soldId, uint128 boughtId
    );
    event AddLiquidity(address indexed provider, uint256[] tokenAmounts,
        uint256[] fees, uint256 invariant, uint256 lpTokenSupply
    );
    event RemoveLiquidity(address indexed provider, uint256[] tokenAmounts,
        uint256 lpTokenSupply
    );
    event RemoveLiquidityOne(address indexed provider, uint256 lpTokenAmount,
        uint256 lpTokenSupply, uint256 boughtId, uint256 tokensBought
    );
    event RemoveLiquidityImbalance(address indexed provider,
        uint256[] tokenAmounts, uint256[] fees, uint256 invariant,
        uint256 lpTokenSupply
    );

    /**
     * @param _pooledTokens an array of ERC20s this pool will accept
     * @param precisions the precision to use for each pooled token,
     *        eg 10 ** 8 for WBTC. Cannot be larger than POOL_PRECISION
     * @param lpTokenName, the long-form name of the token to be deployed
     * @param lpTokenSymbol, the short symbol for the token to be deployed
     * @param _A the the amplification coefficient * n * (n - 1). See the
     *        StableSwap paper for details
     * @param _fee TODO TODO
     */
    constructor(
        IERC20[] memory _pooledTokens, uint256[] memory precisions,
        string memory lpTokenName, string memory lpTokenSymbol, uint256 _A,
        uint256 _fee
    ) public OwnerPausable() ReentrancyGuard() {
        require(
            _pooledTokens.length <= 32,
            "Pools with over 32 tokens aren't supported"
        );
        require(
            _pooledTokens.length == precisions.length,
            "Each pooled token needs a specified precision"
        );

        for (uint i = 0; i < _pooledTokens.length; i++) {
            require(
                address(_pooledTokens[i]) != address(0),
                "The 0 address isn't an ERC-20"
            );
            require(
                precisions[i] <= SwapUtils.POOL_PRECISION,
                "Token precision can't be higher than the pool precision"
            );
            precisions[i] = SwapUtils.POOL_PRECISION.div(precisions[i]);
        }

        swapStorage = SwapUtils.Swap({
            lpToken: new LPToken(lpTokenName, lpTokenSymbol),
            pooledTokens: _pooledTokens,
            tokenPrecisionMultipliers: precisions,
            balances: new uint256[](_pooledTokens.length),
            A: _A,
            fee: _fee,
            adminFee: 0
        });
    }

    /**
     * @notice Return A, the the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     */
    function getA() public view returns (uint256) {
        return swapStorage.getA();
    }

    /**
     * @notice Return address of the pooled token at given index
     * @param index the index of the token
     */
    function getToken(uint8 index) public view returns (IERC20) {
        return swapStorage.pooledTokens[index];
    }

    /**
     * @notice Return current balance of the pooled token at given index
     * @param index the index of the token
     */
    function getTokenBalance(uint8 index) public view returns (uint256) {
        return swapStorage.balances[index];
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param tokenAmount the amount of the token you want to receive
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     */
    function removeLiquidityOneToken(
        uint256 tokenAmount, uint8 tokenIndex, uint256 minAmount
    ) public virtual nonReentrant onlyUnpaused {
        return swapStorage.removeLiquidityOneToken(tokenAmount, tokenIndex, minAmount);
    }

    /**
     * @notice Get the virtual price, to help calculate profit
     * @return the virtual price, scaled to the POOL_PRECISION
     */
    function getVirtualPrice() public view returns (uint256) {
        return swapStorage.getVirtualPrice();
    }

    /**
     * @notice Add liquidity to the pool
     * @param amounts the amounts of each token to add, in their native
     *        precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     *        should mint, otherwise revert. Handy for front-running mitigation
     */
    function addLiquidity(uint256[] memory amounts, uint256 minToMint)
        public virtual nonReentrant onlyUnpaused {
        swapStorage.addLiquidity(amounts, minToMint);
    }

    /**
     * @notice swap two tokens in the pool
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell
     * @param minDy the min amount the user would like to receive, or revert.
     */
    function swap(
        uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 dx, uint256 minDy
    ) public virtual nonReentrant onlyUnpaused {
        return swapStorage.swap(tokenIndexFrom, tokenIndexTo, dx, minDy);
    }

    /**
     * @notice calculate amount of tokens you receive on swap
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell
     * @return amount of tokens the user will receive
     */
    function calculateSwap(uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 dx
    ) external view returns(uint256) {
        return swapStorage.calculateSwap(tokenIndexFrom, tokenIndexTo, dx);
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool.
     * @dev Liquidity can always be removed, even when the pool is paused.
     * @param amount the amount of LP tokens to burn
     * @param minAmounts the minimum amounts of each token in the pool
     *        acceptable for this burn. Useful as a front-running mitigation
     */
    function removeLiquidity(uint256 amount, uint256[] memory minAmounts)
        public virtual nonReentrant {
        return swapStorage.removeLiquidity(amount, minAmounts);
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     *         pool's current balances.
     * @param amounts how much of each token to withdraw
     * @param maxBurnAmount the max LP token provider is willing to pay to
     *        remove liquidity. Useful as a front-running mitigation.
     */
    function removeLiquidityImbalance(
        uint256[] memory amounts, uint256 maxBurnAmount
    ) public virtual nonReentrant onlyUnpaused {
        return swapStorage.removeLiquidityImbalance(amounts, maxBurnAmount);
    }

    /**
     * @notice A simple method to calculate prices from deposits or
     *         withdrawals, excluding fees but including slippage. This is
     *         helpful as an input into the various "min" parameters on calls
     *         to fight front-running
     * @dev This shouldn't be used outside frontends for user estimates.
     * @param amounts an array of token amounts to deposit or withdrawal,
     *        corresponding to pooledTokens. The amount should be in each
     *        pooled token's native precision
     * @param deposit whether this is a deposit or a withdrawal
     */
    function calculateTokenAmount(uint256[] calldata amounts, bool deposit)
        external view returns(uint256) {
        return swapStorage.calculateTokenAmount(amounts, deposit);
    }
}
