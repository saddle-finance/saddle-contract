pragma solidity ^0.6.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./LPToken.sol";
import "./OwnerPausable.sol";
import "./Utils.sol";

contract Swap is OwnerPausable(), ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using MathUtils for uint256;

    LPToken public lpToken;

    IERC20[] public pooledTokens;
    // the precision all pools tokens will be converted to
    // TODO paramaterize and make immutable
    uint256 constant POOL_PRECISION = 10 ** 18;
    // multipliers for each pooled token's precision to get to POOL_PRECISION
    // for example, TBTC has 18 decimals, so the multiplier should be 1. WBTC
    // has 8, so the multiplier should be 10 ** 18 / 10 ** 8 => 10 ** 10
    uint256[] public tokenPrecisionMultipliers;
    // the pool balance of each token, in the token's precision
    // the contract's actual token balance might differ
    uint256[] public balances;

    // variables around the management of A,
    // the amplification coefficient * n * (n - 1)
    // see https://www.curve.fi/stableswap-paper.pdf for details
    uint256 public A;

    // fee calculation
    uint256 public fee;
    uint256 public adminFee = 0;
    uint256 constant FEE_DENOMINATOR = 10 ** 10;

    // events
    event TokenSwap(address indexed buyer, uint256 tokensSold,
        uint256 tokensBought, uint128 soldId, uint128 boughtId
    );
    event AddLiquidity(address indexed provider, uint256[] tokenAmounts,
        uint256[] fees, uint256 invariant, uint256 lpTokenSupply
    );
    event RemoveLiquidity(address indexed provider, uint256[] tokenAmounts,
        uint256[] fees, uint256 lpTokenSupply
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
    ) public {
        require(
            _pooledTokens.length <= 32,
            "Pools with over 32 tokens aren't supported"
        );
        require(
            _pooledTokens.length == precisions.length,
            "Each pooled token needs a specified precision"
        );

        lpToken = new LPToken(lpTokenName, lpTokenSymbol);

        pooledTokens = _pooledTokens;
        tokenPrecisionMultipliers = precisions;
        for (uint i = 0; i<pooledTokens.length; i++) {
            require(
                address(pooledTokens[i]) != address(0),
                "The 0 address isn't an ERC-20"
            );
            require(
                precisions[i] <= POOL_PRECISION,
                "Token precision can't be higher than the pool precision"
            );
            tokenPrecisionMultipliers[i] = POOL_PRECISION.div(precisions[i]);
            balances[i] = 0;
        }

        A = _A;

        fee = _fee;
    }

    /**
     * @notice Return A, the the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     */
    function getA() public view returns (uint256) {
        return A;
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param tokenAmount the amount of the token you want to receive
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     */
    function removeLiquidityOneToken(
        uint256 tokenAmount, uint8 tokenIndex, uint256 minAmount
    ) public nonReentrant onlyUnpaused {
        // TODO up-front balance checks?
        uint256 totalSupply = lpToken.totalSupply();
        uint256 numTokens = pooledTokens.length;
        require(tokenIndex < numTokens, "Token not found");

        uint256 dyFee = 0;
        uint256 dy = 0;

        (dy, dyFee) = calculateWithdrawOneToken(tokenAmount, tokenIndex);
        require(dy >= minAmount, "The min amount of tokens wasn't met");

        balances[tokenIndex] = balances[tokenIndex].sub(
            dy.add(dyFee.mul(adminFee).div(FEE_DENOMINATOR))
        );
        lpToken.burnFrom(msg.sender, tokenAmount);
        pooledTokens[tokenIndex].safeTransfer(msg.sender, dy);

        emit RemoveLiquidityOne(
            msg.sender, tokenAmount, totalSupply, tokenIndex, dy
        );
    }

    /**
     * @notice calculate the dy and fee of withdrawing in one token
     * @param tokenAmount the amount to withdraw in the pool's precision
     * @param tokenIndex which token will be withdrawn
     * @return the dy and the associated fee
     */
    function calculateWithdrawOneToken(uint256 tokenAmount, uint8 tokenIndex)
        internal view returns(uint256, uint256) {

        // Get the current D, then solve the stableswap invariant
        // y_i for D - tokenAmount
        uint256 D0 = getD(_xp(), getA());
        uint256 D1 = D0.sub(tokenAmount.mul(D0).div(lpToken.totalSupply()));
        uint256[] memory xpReduced = _xp();

        uint256 newY = getYD(getA(), tokenIndex, _xp(), D1);

        for (uint i = 0; i<pooledTokens.length; i++) {
            uint256 _fee = fee.mul(
                pooledTokens.length.div(pooledTokens.length.sub(1).mul(4)));
            uint256 xpi = _xp()[i];
            // if i == tokenIndex, dxExpected = xp[i] * D1 / D0 - newY
            // else dxExpected = xp[i] - (xp[i] * D1 / D0)
            // xpReduced[i] -= dxExpected * fee / FEE_DENOMINATOR
            xpReduced[i] = xpReduced[i].sub(
                ((i == tokenIndex) ?
                    xpi.mul(D1).div(D0).sub(newY) :
                    xpi.sub(xpi.mul(D1).div(D0))
                ).mul(_fee).div(FEE_DENOMINATOR));
        }
        uint256 dy = xpReduced[tokenIndex].sub(
            getYD(getA(), tokenIndex, xpReduced, D1));
        dy = dy.sub(1).div(tokenPrecisionMultipliers[tokenIndex]);

        // dy_0 (without fees)
        // dy, dy0 - dy
        return (dy, _xp()[tokenIndex].sub(newY).div(
            tokenPrecisionMultipliers[tokenIndex]).sub(dy));
    }

    /**
     * @notice Calculate the price of a token in the pool given
     *         precision-adjusted balances and a particular D
     *         and precision-adjusted array of balances.
     * @dev This is accomplished via solving the quadratic equation
     *      iteratively. See the StableSwap paper and Curve.fi
     *      implementation for details.
     * @param _A the the amplification coefficient * n * (n - 1). See the
     *        StableSwap paper for details
     * @param tokenIndex which token we're calculating
     * @param xp a precision-adjusted set of pool balances. Array should be
     *        the same cardinality as the pool
     * @param D the stableswap invariant
     * @return the price of the token, in the same precision as in xp
     */
    function getYD(uint256 _A, uint8 tokenIndex, uint256[] memory xp, uint256 D)
        internal pure returns (uint256) {
        uint256 numTokens = xp.length;
        require(tokenIndex < numTokens, "Token not found");

        uint256 c = D;
        uint256 s = 0;
        uint256 nA = _A.mul(numTokens);

        for (uint i = 0; i < numTokens; i++) {
            if (i != tokenIndex) {
                s = s.add(xp[i]);
                c = c.mul(D).div(xp[i].mul(numTokens));
            } else {
                continue;
            }
        }
        c = c.mul(D).div(nA.mul(numTokens));

        uint256 b = s.add(D.div(nA));
        uint256 yPrev = 0;
        uint256 y = D;
        for (uint i = 0; i<256; i++) {
            yPrev = y;
            y = y.mul(y).add(c).div(y.mul(2).add(b).sub(D));
            if(y.within1(yPrev)) {
                break;
            }
        }
        return y;
    }

    /**
     * @notice Get D, the StableSwap invariant, based on a set of balances
     *         and a particular A
     * @param xp a precision-adjusted set of pool balances. Array should be
     *        the same cardinality as the pool
     * @param _A the the amplification coefficient * n * (n - 1). See the
     *        StableSwap paper for details
     * @return The invariant, at the precision of the pool
     */
    function getD(uint256[] memory xp, uint256 _A)
        internal pure returns (uint256) {
        uint256 numTokens = xp.length;
        uint256 s = 0;
        for (uint i = 0; i < numTokens; i++) {
            s = s.add(xp[i]);
        }
        if (s == 0) {
            return 0;
        }

        uint256 prevD = 0;
        uint256 D = s;
        uint256 nA = _A.mul(numTokens);

        for (uint i = 0; i < 256; i++) {
            uint256 dP = D;
            for (uint j = 0; j < numTokens; i++) {
                // TODO look into this div by 0
                dP = dP.mul(D).div(xp[i].mul(numTokens));
            }
            prevD = D;
            D = nA.mul(s).add(dP.mul(numTokens)).mul(D).div(
                nA.sub(1).mul(D).add(numTokens).add(1).mul(dP));
            if (D.within1(prevD)) {
                break;
            }
        }
        return D;
    }

    /**
     * @notice Given a set of balances and precision multipliers, return the
     *         precision-adjusted balances.
     * @dev
     * @param _balances an array of token balances, in their native precisions.
     *        These should generally correspond with pooled tokens.
     * @param precisionMultipliers an array of multipliers, corresponding to
     *        the amounts in the _balances array. When multiplied together they
     *        should yield amounts at the pool's precision.
     * @return an array of amounts "scaled" to the pool's precision
     */
    function _xp(
        uint256[] memory _balances,
        uint256[] memory precisionMultipliers
    ) internal pure returns (uint256[] memory) {
        uint256 numTokens = _balances.length;
        require(
            numTokens == precisionMultipliers.length,
            "Balances must map to token precision multipliers"
        );
        uint256[] memory xp = _balances;
        for (uint i = 0; i < numTokens; i++) {
            xp[i] = xp[i].mul(precisionMultipliers[i]);
        }
        return xp;
    }

    /**
     * @notice Return the precision-adjusted balances of all tokens in the pool
     * @return the pool balances "scaled" to the pool's precision, allowing
     *          them to be more easily compared.
     */
    function _xp(uint256[] memory _balances)
        internal view returns (uint256[] memory) {
        return _xp(_balances, tokenPrecisionMultipliers);
    }

    /**
     * @notice Return the precision-adjusted balances of all tokens in the pool
     * @return the pool balances "scaled" to the pool's precision, allowing
     *          them to be more easily compared.
     */
    function _xp() internal view returns (uint256[] memory) {
        return _xp(balances, tokenPrecisionMultipliers);
    }

    /**
     * @notice Get the virtual price, to help calculate profit
     * @return the virtual price, scaled to the POOL_PRECISION
     */
    function getVirtualPrice() public view returns (uint256) {
        uint256 D = getD(_xp(), getA());
        uint256 supply = lpToken.totalSupply();
        return D.mul(POOL_PRECISION).div(supply);
    }

    /**
     * @notice Add liquidity to the pool
     * @param amounts the amounts of each token to add, in their native
     *        precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     *        should mint, otherwise revert. Handy for front-running mitigation
     */
    function addLiquidity(uint256[] calldata amounts, uint256 minToMint)
        external nonReentrant onlyUnpaused {
        require(
            amounts.length == pooledTokens.length,
            "Amounts must map to pooled tokens"
        );

        uint256[] memory fees = new uint256[](pooledTokens.length);
        uint256 _fee = fee.mul(pooledTokens.length).div(
            pooledTokens.length.sub(1).mul(4));

        // current state
        uint256 D0 = 0;
        uint256[] memory balances0 = balances;
        if (lpToken.totalSupply() > 0) {
            D0 = getD(_xp(balances0), getA());
        }
        uint256[] memory balances1 = balances0;

        for (uint i = 0; i < pooledTokens.length; i++) {
            require(
                lpToken.totalSupply() > 0 || amounts[i] > 0,
                "If token supply is zero, must supply all tokens in pool"
            );
            balances1[i] = balances0[i].add(amounts[i]);
        }

        // invariant after change
        uint256 D1 = getD(_xp(balances1), getA());
        require(D1 > D0, "D should increase after additional liquidity");

        // updated to reflect fees and calculate the user's LP tokens
        uint256 D2 = D1;
        if (lpToken.totalSupply() > 0) {
            uint256[] memory balances2 = balances1;
            for (uint i = 0; i < pooledTokens.length; i++) {
                uint256 idealBalance = D1.mul(balances0[i]).div(D0);
                uint256 difference = idealBalance.difference(balances1[i]);
                fees[i] = _fee.mul(difference).div(FEE_DENOMINATOR);
                balances[i] = balances2[i].sub(
                    fees[i].mul(adminFee).div(FEE_DENOMINATOR));
                balances2[i] = balances2[i].sub(fees[i]);
            }
            D2 = getD(_xp(balances2), getA());
        } else {
            // the initial depositor doesn't pay fees
            balances = balances1;
        }

        uint256 toMint = 0;
        if (lpToken.totalSupply() == 0) {
            toMint = D1;
        } else {
            toMint = D2.sub(D0).div(D0).mul(lpToken.totalSupply());
        }

        require(toMint >= minToMint, "Couldn't mint min requested LP tokens");

        for (uint i = 0; i < pooledTokens.length; i++) {
            if (amounts[i] > 0) {
                pooledTokens[i].safeTransferFrom(
                    msg.sender, address(this), amounts[i]);
            }
        }

        // mint the user's LP tokens
        lpToken.mint(msg.sender, toMint);

        emit AddLiquidity(
            msg.sender, amounts, fees, D1, lpToken.totalSupply().add(toMint)
        );
    }

    /// TODO NatSpec
    function getY(
        uint8 tokenIndex1, uint8 tokenIndex2, uint256 x, uint256[] memory xp
    ) internal view returns (uint256) {
        uint256 numTokens = pooledTokens.length;
        require(tokenIndex1 != tokenIndex2, "Can't compare token to itself");
        require(
            tokenIndex1 < numTokens && tokenIndex2 < numTokens,
            "Tokens must be in pool"
        );

        uint256 _A = getA();
        uint256 D = getD(xp, _A);
        uint256 c = D;
        uint256 s = 0;
        uint256 nA = numTokens.mul(_A);

        uint256 _x = 0;
        for (uint i = 0; i < numTokens; i++) {
            if (i == tokenIndex1) {
                _x = x;
            } else if (i != tokenIndex2) {
                _x = xp[i];
            }
            else {
                continue;
            }
            s = s.add(_x);
            c = c.mul(D).div(_x.mul(numTokens));
        }
        c = c.mul(D).div(nA.mul(numTokens));
        uint256 b = s.add(D.div(nA));
        uint256 yPrev = 0;
        uint256 y = D;

        // iterative approximation
        for (uint i = 0; i < 256; i++) {
            yPrev = y;
            y = y.mul(y).add(c).div(y.mul(2).add(b).sub(D));
            if (y.within1(yPrev)) {
                break;
            }
        }
        return y;
    }

    function getDY(uint8 tokenIndex1, uint8 tokenIndex2, uint256 dx)
        internal view returns(uint256) {
        uint256[] memory xp = _xp();
        uint256 x = xp[tokenIndex1].add(dx).mul(
            tokenPrecisionMultipliers[tokenIndex1]);
        uint256 y = getY(tokenIndex1, tokenIndex2, x, xp);
        uint256 dy = xp[tokenIndex2].sub(y).sub(1).div(
            tokenPrecisionMultipliers[tokenIndex2]);
        uint256 _fee = fee.mul(dy).div(FEE_DENOMINATOR);
        return dy - _fee;
    }

    /**
     * @notice Internally execute a swap between two tokens.
     * @dev The caller is expected to transfer the actual amounts (dx and dy)
     *      using the token contracts.
     * @param tokenIndex1 the token to sell
     * @param tokenIndex2 the token to buy
     * @param dx the number of tokens to sell
     */
    function _swap(uint8 tokenIndex1, uint8 tokenIndex2, uint256 dx)
        internal onlyUnpaused returns(uint256) {
        uint256[] memory xp = _xp();

        uint256 x = dx.mul(tokenPrecisionMultipliers[tokenIndex1]).add(
            xp[tokenIndex1]);
        uint256 y = getY(tokenIndex1, tokenIndex2, x, xp);
        uint256 dy = xp[tokenIndex2].sub(y).sub(1);
        uint256 dyFee = dy.mul(fee).div(FEE_DENOMINATOR);
        uint256 dyAdminFee = dyFee.mul(adminFee).div(FEE_DENOMINATOR);

        dy = dy.sub(dyFee).div(tokenPrecisionMultipliers[tokenIndex2]);
        dyAdminFee = dyAdminFee.div(tokenPrecisionMultipliers[tokenIndex2]);

        balances[tokenIndex1] = balances[tokenIndex1].add(dx);
        balances[tokenIndex2] = balances[tokenIndex2].sub(dy).sub(dyAdminFee);

        return dy;
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
    ) external nonReentrant {
        uint256 dy = _swap(tokenIndexFrom, tokenIndexTo, dx);
        require(dy >= minDy, "Swap didn't result in min tokens");

        pooledTokens[tokenIndexFrom].safeTransferFrom(
            msg.sender, address(this), dx);
        pooledTokens[tokenIndexTo].safeTransfer(msg.sender, dy);

        emit TokenSwap(msg.sender, dx, dy, tokenIndexFrom, tokenIndexTo);
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool.
     * @dev Liquidity can always be removed, even when the pool is paused.
     * @param amount the amount of LP tokens to burn
     * @param minAmounts the minimum amounts of each token in the pool
     *        acceptable for this burn. Useful as a front-running mitigation
     */
    function removeLiquidity(uint256 amount, uint256[] calldata minAmounts)
        external nonReentrant {
        uint256 numTokens = pooledTokens.length;
        require(
            minAmounts.length == numTokens,
            "Min amounts should correspond to pooled tokens"
        );

        uint256 totalSupply = lpToken.totalSupply();
        uint256[] memory amounts = minAmounts;
        uint256[] memory fees = minAmounts;

        for (uint i = 0; i < numTokens; i++) {
            uint256 value = balances[i].mul(amount).div(totalSupply);
            require(
                value >= minAmounts[i],
                "Resulted in fewer tokens than expected"
            );
            balances[i] = balances[i].sub(value);
            amounts[i] = value;
        }

        lpToken.burnFrom(msg.sender, amount);

        for (uint i = 0; i < numTokens; i++) {
            pooledTokens[i].safeTransfer(msg.sender, amounts[i]);
        }

        emit RemoveLiquidity(
            msg.sender, amounts, fees, totalSupply.sub(amount)
        );
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     *         pool's current balances.
     * @param amounts how much of each token to withdraw
     * @param maxBurnAmount the max LP token provider is willing to pay to
     *        remove liquidity. Useful as a front-running mitigation.
     */
    function removeLiquidityImbalance(uint256[] calldata amounts, uint256 maxBurnAmount)
        external nonReentrant onlyUnpaused {
        require(
            amounts.length == pooledTokens.length,
            "Amounts should correspond to pooled tokens"
        );

        uint256 tokenSupply = lpToken.totalSupply();
        require(
            tokenSupply > 0 && tokenSupply > maxBurnAmount,
            "Can't remove liquidity from an empty pool"
        );
        uint256 _fee = fee.mul(pooledTokens.length).div(
            pooledTokens.length.sub(1).mul(4));

        uint256[] memory balances1 = balances;

        uint256 D0 = getD(_xp(), getA());
        for (uint i = 0; i < pooledTokens.length; i++) {
            balances1[i] = balances1[i].sub(amounts[i]);
        }
        uint256 D1 = getD(_xp(balances1), getA());
        uint256[] memory fees = new uint256[](pooledTokens.length);

        for (uint i = 0; i < pooledTokens.length; i++) {
            uint256 idealBalance = D1.mul(balances[i]).div(D0);
            uint256 difference = idealBalance.difference(balances1[i]);
            fees[i] = _fee.mul(difference).div(FEE_DENOMINATOR);
            balances[i] = balances1[i].sub(fees[i].mul(adminFee).div(
                FEE_DENOMINATOR));
            balances1[i] = balances1[i].sub(fees[i]);
        }

        uint256 D2 = getD(_xp(balances1), getA());

        uint256 tokenAmount = D0.sub(D2).mul(tokenSupply).div(D0).add(1);
        require(
            tokenAmount >= maxBurnAmount,
            "More expensive than the max burn amount"
        );

        lpToken.burnFrom(msg.sender, tokenAmount);

        for (uint i = 0; i < pooledTokens.length; i++) {
            pooledTokens[i].safeTransfer(msg.sender, amounts[i]);
        }

        emit RemoveLiquidityImbalance(
            msg.sender, amounts, fees, D1, tokenSupply.sub(tokenAmount));
    }

    /**
     * @notice A simple method to calculate prices from deposits or
     *         withdrawals, excluding fees but including slippasge. This is
     *         helpful as an input into the various "min" parameters on calls
     *         to fight front-running
     * @dev This shouldn't be used outside frontends for user estimates.
     * @param amounts an array of token amounts to deposit or withdrawl,
     *        corresponding to pooledTokens. The amount should be in each
     *        pooled token's native precision
     * @param deposit whether this is a deposit or a withdrawal
     */
    function calculateTokenAmount(uint256[] calldata amounts, bool deposit)
        external view returns(uint256) {
        uint256 numTokens = pooledTokens.length;
        uint256 _A = getA();
        uint256 D0 = getD(_xp(balances), _A);
        uint256[] memory balances1 = balances;
        for (uint i = 0; i < numTokens; i++) {
            if (deposit) {
                balances1[i] = balances1[i].add(amounts[i]);
            } else {
                balances1[i] = balances1[i].sub(amounts[i]);
            }
        }
        uint256 D1 = getD(_xp(balances1), _A);
        uint256 totalSupply = lpToken.totalSupply();
        return (deposit ? D1.sub(D0) : D0.sub(D1)).mul(totalSupply).div(D0);
    }
}
