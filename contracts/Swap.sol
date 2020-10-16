pragma solidity ^0.5.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OwnerPausable.sol";
import "./SwapUtils.sol";
import "./MathUtils.sol";
import "./Allowlist.sol";

contract Swap is OwnerPausable, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using MathUtils for uint256;
    using SwapUtils for SwapUtils.Swap;

    SwapUtils.Swap public swapStorage;
    IAllowlist public allowlist;
    bool public isGuarded = true;

    /*** EVENTS ***/

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
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     * @param _withdrawFee default withdrawFee to be initliazed with
     * @param _allowlist address of allowlist contract for guarded launch
     */
    constructor(
        IERC20[] memory _pooledTokens, uint256[] memory precisions,
        string memory lpTokenName, string memory lpTokenSymbol, uint256 _A,
        uint256 _fee, uint256 _adminFee, uint256 _withdrawFee, IAllowlist _allowlist
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
                precisions[i] <= 10 ** uint256(SwapUtils.getPoolPrecisionDecimals()),
                "Token precision can't be higher than the pool precision"
            );
            precisions[i] = (10 ** uint256(SwapUtils.getPoolPrecisionDecimals())).div(precisions[i]);
        }

        swapStorage = SwapUtils.Swap({
            lpToken: new LPToken(lpTokenName, lpTokenSymbol, SwapUtils.getPoolPrecisionDecimals()),
            pooledTokens: _pooledTokens,
            tokenPrecisionMultipliers: precisions,
            balances: new uint256[](_pooledTokens.length),
            A: _A,
            swapFee: _fee,
            adminFee: _adminFee,
            defaultWithdrawFee: _withdrawFee
        });

        allowlist = _allowlist;
        allowlist.getAllowedAmount(address(this), address(0)); // crude check of the allowlist contract address
        isGuarded = true;
    }

    /*** MODIFIERS ***/

    /**
     * @notice Modifier to check deadline against current timestamp
     * @param deadline latest timestamp to accept this transaction
     */
    modifier deadlineCheck(uint256 deadline) {
        require(block.timestamp <= deadline, "Deadline not met");
        _;
    }

    /*** VIEW FUNCTIONS ***/

    /**
     * @notice Return A, the the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     */
    function getA() external view returns (uint256) {
        return swapStorage.getA();
    }

    /**
     * @notice Return address of the pooled token at given index
     * @param index the index of the token
     */
    function getToken(uint8 index) external view returns (IERC20) {
        return swapStorage.pooledTokens[index];
    }

    /**
     * @notice Return timestamp of last deposit of given address
     */
    function getDepositTimestamp(address user) external view returns (uint256) {
        return swapStorage.getDepositTimestamp(user);
    }

    /**
     * @notice Return current balance of the pooled token at given index
     * @param index the index of the token
     */
    function getTokenBalance(uint8 index) external view returns (uint256) {
        return swapStorage.balances[index];
    }

    /**
     * @notice Get the virtual price, to help calculate profit
     * @return the virtual price, scaled to the POOL_PRECISION
     */
    function getVirtualPrice() external view returns (uint256) {
        return swapStorage.getVirtualPrice();
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

    /**
     * @notice A simple method to calculate amount of each underlying
     *         tokens that is returned upon burning given amount of
     *         LP tokens
     * @param amount the amount of LP tokens that would be burned on
     *        withdrawal
     */
    function calculateRemoveLiquidity(uint256 amount) external view returns (uint256[] memory) {
        return swapStorage.calculateRemoveLiquidity(amount);
    }

    /**
     * @notice calculate the amount of underlying token available to withdraw
     *         when withdrawing via only single token
     * @param tokenAmount the amount of LP token to burn
     * @param tokenIndex index of which token will be withdrawn
     * @return availableTokenAmount calculated amount of underlying token
     *         available to withdraw
     */
    function calculateRemoveLiquidityOneToken(uint256 tokenAmount, uint8 tokenIndex
    ) external view returns (uint256 availableTokenAmount) {
        (availableTokenAmount, ) = swapStorage.calculateWithdrawOneToken(tokenAmount, tokenIndex);
    }

    /**
     * @notice calculate the fee that is applied when the given user withdraws
     * @dev returned value should be divided by FEE_DENOMINATOR to convert to correct decimals
     * @param user address you want to calculate withdraw fee of
     * @return current withdraw fee of the user
     */
    function calculateCurrentWithdrawFee(address user) external view returns (uint256) {
        return swapStorage.calculateCurrentWithdrawFee(user);
    }

    /**
     * @notice return accumulated amount of admin fees of the token with given index
     * @param index Index of the pooled token
     * @return admin's token balance in the token's precision
     */
    function getAdminBalance(uint256 index) external view returns (uint256) {
        return swapStorage.getAdminBalance(index);
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice swap two tokens in the pool
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell
     * @param minDy the min amount the user would like to receive, or revert.
     */
    function swap(
        uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 dx, uint256 minDy, uint256 deadline
    ) external nonReentrant onlyUnpaused deadlineCheck(deadline) {
        return swapStorage.swap(tokenIndexFrom, tokenIndexTo, dx, minDy);
    }

    /**
     * @notice Add liquidity to the pool
     * @param amounts the amounts of each token to add, in their native
     *        precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     *        should mint, otherwise revert. Handy for front-running mitigation
     */
    function addLiquidity(uint256[] calldata amounts, uint256 minToMint, uint256 deadline)
        external nonReentrant onlyUnpaused deadlineCheck(deadline) {
        swapStorage.addLiquidity(amounts, minToMint);

        if (isGuarded) {
            // Check per user deposit limit
            require(
                allowlist.getAllowedAmount(address(this), msg.sender) >= swapStorage.lpToken.balanceOf(msg.sender),
                "Deposit limit reached"
            );
            // Check pool's TVL cap limit via totalSupply of the pool token
            require(
                allowlist.getPoolCap(address(this)) >= swapStorage.lpToken.totalSupply(),
                "Pool TVL cap reached"
            );
        }
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool.
     * @dev Liquidity can always be removed, even when the pool is paused.
     * @param amount the amount of LP tokens to burn
     * @param minAmounts the minimum amounts of each token in the pool
     *        acceptable for this burn. Useful as a front-running mitigation
     */
    function removeLiquidity(uint256 amount, uint256[] calldata minAmounts, uint256 deadline)
        external nonReentrant deadlineCheck(deadline) {
        return swapStorage.removeLiquidity(amount, minAmounts);
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param tokenAmount the amount of the token you want to receive
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     */
    function removeLiquidityOneToken(
        uint256 tokenAmount, uint8 tokenIndex, uint256 minAmount, uint256 deadline
    ) external nonReentrant onlyUnpaused deadlineCheck(deadline) {
        return swapStorage.removeLiquidityOneToken(tokenAmount, tokenIndex, minAmount);
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     *         pool's current balances.
     * @param amounts how much of each token to withdraw
     * @param maxBurnAmount the max LP token provider is willing to pay to
     *        remove liquidity. Useful as a front-running mitigation.
     */
    function removeLiquidityImbalance(
        uint256[] calldata amounts, uint256 maxBurnAmount, uint256 deadline
    ) external nonReentrant onlyUnpaused deadlineCheck(deadline) {
        return swapStorage.removeLiquidityImbalance(amounts, maxBurnAmount);
    }

    /*** ADMIN FUNCTIONS ***/

    /**
     * @notice withdraw all admin fees to the contract owner
     */
    function withdrawAdminFees() external onlyOwner {
        swapStorage.withdrawAdminFees(owner());
    }

    /**
     * @notice update the admin fee
     * @param newAdminFee new admin fee to be applied on future transactions
     */
    function setAdminFee(uint256 newAdminFee) external onlyOwner {
        swapStorage.setAdminFee(newAdminFee);
    }

    /**
     * @notice update the swap fee
     * @param newSwapFee new swap fee to be applied on future transactions
     */
    function setSwapFee(uint256 newSwapFee) external onlyOwner {
        swapStorage.setSwapFee(newSwapFee);
    }

    /**
     * @notice update the withdraw fee
     * @param newWithdrawFee new withdraw fee to be applied on future deposits
     */
    function setDefaultWithdrawFee(uint256 newWithdrawFee) external onlyOwner {
        swapStorage.setDefaultWithdrawFee(newWithdrawFee);
    }

    /**
     * @notice update the guarded status of the pool deposits
     * @param isGuarded_ boolean value indicating whether the deposits should be guarded
     */
    function setIsGuarded(bool isGuarded_) external onlyOwner {
        isGuarded = isGuarded_;
    }
}
