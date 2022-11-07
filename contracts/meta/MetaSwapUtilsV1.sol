// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "../LPTokenV2.sol";
import "../interfaces/ISwapV2.sol";
import "../MathUtilsV1.sol";
import "../SwapUtilsV2.sol";

/**
 * @title MetaSwapUtils library
 * @notice A library to be used within MetaSwap.sol. Contains functions responsible for custody and AMM functionalities.
 *
 * MetaSwap is a modified version of Swap that allows Swap's LP token to be utilized in pooling with other tokens.
 * As an example, if there is a Swap pool consisting of [DAI, USDC, USDT]. Then a MetaSwap pool can be created
 * with [sUSD, BaseSwapLPToken] to allow trades between either the LP token or the underlying tokens and sUSD.
 *
 * @dev Contracts relying on this library must initialize SwapUtils.Swap struct then use this library
 * for SwapUtils.Swap struct. Note that this library contains both functions called by users and admins.
 * Admin functions should be protected within contracts using this library.
 */
library MetaSwapUtilsV1 {
    using SafeERC20 for IERC20;
    using MathUtilsV1 for uint256;
    using AmplificationUtilsV2 for SwapUtilsV2.Swap;

    /*** EVENTS ***/

    event TokenSwap(
        address indexed buyer,
        uint256 tokensSold,
        uint256 tokensBought,
        uint128 soldId,
        uint128 boughtId
    );
    event TokenSwapUnderlying(
        address indexed buyer,
        uint256 tokensSold,
        uint256 tokensBought,
        uint128 soldId,
        uint128 boughtId
    );
    event AddLiquidity(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256[] fees,
        uint256 invariant,
        uint256 lpTokenSupply
    );
    event RemoveLiquidityOne(
        address indexed provider,
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        uint256 boughtId,
        uint256 tokensBought
    );
    event RemoveLiquidityImbalance(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256[] fees,
        uint256 invariant,
        uint256 lpTokenSupply
    );
    event NewAdminFee(uint256 newAdminFee);
    event NewSwapFee(uint256 newSwapFee);
    event NewWithdrawFee(uint256 newWithdrawFee);

    struct MetaSwap {
        // Meta-Swap related parameters
        ISwapV2 baseSwap;
        uint256 baseVirtualPrice;
        uint256 baseCacheLastUpdated;
        IERC20[] baseTokens;
    }

    // Struct storing variables used in calculations in the
    // calculateWithdrawOneTokenDY function to avoid stack too deep errors
    struct CalculateWithdrawOneTokenDYInfo {
        uint256 d0;
        uint256 d1;
        uint256 newY;
        uint256 feePerToken;
        uint256 preciseA;
        uint256 xpi;
    }

    // Struct storing variables used in calculation in removeLiquidityImbalance function
    // to avoid stack too deep error
    struct ManageLiquidityInfo {
        uint256 d0;
        uint256 d1;
        uint256 d2;
        LPTokenV2 lpToken;
        uint256 totalSupply;
        uint256 preciseA;
        uint256 baseVirtualPrice;
        uint256[] tokenPrecisionMultipliers;
        uint256[] newBalances;
    }

    struct SwapUnderlyingInfo {
        uint256 x;
        uint256 dx;
        uint256 dy;
        uint256[] tokenPrecisionMultipliers;
        uint256[] oldBalances;
        IERC20[] baseTokens;
        IERC20 tokenFrom;
        uint8 metaIndexFrom;
        IERC20 tokenTo;
        uint8 metaIndexTo;
        uint256 baseVirtualPrice;
    }

    struct CalculateSwapUnderlyingInfo {
        uint256 baseVirtualPrice;
        ISwapV2 baseSwap;
        uint8 baseLPTokenIndex;
        uint8 baseTokensLength;
        uint8 metaIndexTo;
        uint256 x;
        uint256 dy;
    }

    // the denominator used to calculate admin and LP fees. For example, an
    // LP fee might be something like tradeAmount.mul(fee).div(FEE_DENOMINATOR)
    uint256 private constant FEE_DENOMINATOR = 10**10;

    // Cache expire time for the stored value of base Swap's virtual price
    uint256 public constant BASE_CACHE_EXPIRE_TIME = 10 minutes;
    uint256 public constant BASE_VIRTUAL_PRICE_PRECISION = 10**18;

    /*** VIEW & PURE FUNCTIONS ***/

    /**
     * @notice Return the stored value of base Swap's virtual price. If
     * value was updated past BASE_CACHE_EXPIRE_TIME, then read it directly
     * from the base Swap contract.
     * @param metaSwapStorage MetaSwap struct to read from
     * @return base Swap's virtual price
     */
    function _getBaseVirtualPrice(MetaSwap storage metaSwapStorage)
        internal
        view
        returns (uint256)
    {
        if (
            block.timestamp >
            metaSwapStorage.baseCacheLastUpdated + BASE_CACHE_EXPIRE_TIME
        ) {
            return metaSwapStorage.baseSwap.getVirtualPrice();
        }
        return metaSwapStorage.baseVirtualPrice;
    }

    function _getBaseSwapFee(ISwapV2 baseSwap)
        internal
        view
        returns (uint256 swapFee)
    {
        (, , , , swapFee, , ) = baseSwap.swapStorage();
    }

    /**
     * @notice Calculate how much the user would receive when withdrawing via single token
     * @param self Swap struct to read from
     * @param metaSwapStorage MetaSwap struct to read from
     * @param tokenAmount the amount to withdraw in the pool's precision
     * @param tokenIndex which token will be withdrawn
     * @return dy the amount of token user will receive
     */
    function calculateWithdrawOneToken(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256 dy) {
        (dy, ) = _calculateWithdrawOneToken(
            self,
            tokenAmount,
            tokenIndex,
            _getBaseVirtualPrice(metaSwapStorage),
            self.lpToken.totalSupply()
        );
    }

    function _calculateWithdrawOneToken(
        SwapUtilsV2.Swap storage self,
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 baseVirtualPrice,
        uint256 totalSupply
    ) internal view returns (uint256, uint256) {
        uint256 dy;
        uint256 dySwapFee;

        {
            uint256 currentY;
            uint256 newY;

            // Calculate how much to withdraw
            (dy, newY, currentY) = _calculateWithdrawOneTokenDY(
                self,
                tokenIndex,
                tokenAmount,
                baseVirtualPrice,
                totalSupply
            );

            // Calculate the associated swap fee
            dySwapFee =
                ((currentY - newY) /
                    self.tokenPrecisionMultipliers[tokenIndex]) -
                dy;
        }

        return (dy, dySwapFee);
    }

    /**
     * @notice Calculate the dy of withdrawing in one token
     * @param self Swap struct to read from
     * @param tokenIndex which token will be withdrawn
     * @param tokenAmount the amount to withdraw in the pools precision
     * @param baseVirtualPrice the virtual price of the base swap's LP token
     * @return the dy excluding swap fee, the new y after withdrawing one token, and current y
     */
    function _calculateWithdrawOneTokenDY(
        SwapUtilsV2.Swap storage self,
        uint8 tokenIndex,
        uint256 tokenAmount,
        uint256 baseVirtualPrice,
        uint256 totalSupply
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        // Get the current D, then solve the stableswap invariant
        // y_i for D - tokenAmount
        uint256[] memory xp = _xp(self, baseVirtualPrice);
        require(tokenIndex < xp.length, "Token index out of range");

        CalculateWithdrawOneTokenDYInfo
            memory v = CalculateWithdrawOneTokenDYInfo(
                0,
                0,
                0,
                0,
                self._getAPrecise(),
                0
            );
        v.d0 = SwapUtilsV2.getD(xp, v.preciseA);
        v.d1 = v.d0 - ((tokenAmount * v.d0) / totalSupply);

        require(tokenAmount <= xp[tokenIndex], "Withdraw exceeds available");

        v.newY = SwapUtilsV2.getYD(v.preciseA, tokenIndex, xp, v.d1);

        uint256[] memory xpReduced = new uint256[](xp.length);

        v.feePerToken = SwapUtilsV2._feePerToken(self.swapFee, xp.length);
        for (uint256 i = 0; i < xp.length; i++) {
            v.xpi = xp[i];
            // if i == tokenIndex, dxExpected = xp[i] * d1 / d0 - newY
            // else dxExpected = xp[i] - (xp[i] * d1 / d0)
            // xpReduced[i] -= dxExpected * fee / FEE_DENOMINATOR
            xpReduced[i] =
                v.xpi -
                (((
                    (i == tokenIndex)
                        ? (v.xpi * v.d1) / v.d0 - v.newY
                        : v.xpi - ((v.xpi * v.d1) / v.d0)
                ) * v.feePerToken) / FEE_DENOMINATOR);
        }

        uint256 dy = xpReduced[tokenIndex] -
            SwapUtilsV2.getYD(v.preciseA, tokenIndex, xpReduced, v.d1);

        if (tokenIndex == xp.length - 1) {
            dy = (dy * BASE_VIRTUAL_PRICE_PRECISION) / baseVirtualPrice;
            v.newY = (v.newY * BASE_VIRTUAL_PRICE_PRECISION) / baseVirtualPrice;
            xp[tokenIndex] =
                (xp[tokenIndex] * BASE_VIRTUAL_PRICE_PRECISION) /
                baseVirtualPrice;
        }
        dy = (dy - 1) / self.tokenPrecisionMultipliers[tokenIndex];

        return (dy, v.newY, xp[tokenIndex]);
    }

    /**
     * @notice Given a set of balances and precision multipliers, return the
     * precision-adjusted balances. The last element will also get scaled up by
     * the given baseVirtualPrice.
     *
     * @param balances an array of token balances, in their native precisions.
     * These should generally correspond with pooled tokens.
     *
     * @param precisionMultipliers an array of multipliers, corresponding to
     * the amounts in the balances array. When multiplied together they
     * should yield amounts at the pool's precision.
     *
     * @param baseVirtualPrice the base virtual price to scale the balance of the
     * base Swap's LP token.
     *
     * @return an array of amounts "scaled" to the pool's precision
     */
    function _xp(
        uint256[] memory balances,
        uint256[] memory precisionMultipliers,
        uint256 baseVirtualPrice
    ) internal pure returns (uint256[] memory) {
        uint256[] memory xp = SwapUtilsV2._xp(balances, precisionMultipliers);
        uint256 baseLPTokenIndex = balances.length - 1;
        xp[baseLPTokenIndex] =
            (xp[baseLPTokenIndex] * baseVirtualPrice) /
            BASE_VIRTUAL_PRICE_PRECISION;
        return xp;
    }

    /**
     * @notice Return the precision-adjusted balances of all tokens in the pool
     * @param self Swap struct to read from
     * @return the pool balances "scaled" to the pool's precision, allowing
     * them to be more easily compared.
     */
    function _xp(SwapUtilsV2.Swap storage self, uint256 baseVirtualPrice)
        internal
        view
        returns (uint256[] memory)
    {
        return
            _xp(
                self.balances,
                self.tokenPrecisionMultipliers,
                baseVirtualPrice
            );
    }

    /**
     * @notice Get the virtual price, to help calculate profit
     * @param self Swap struct to read from
     * @param metaSwapStorage MetaSwap struct to read from
     * @return the virtual price, scaled to precision of BASE_VIRTUAL_PRICE_PRECISION
     */
    function getVirtualPrice(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage
    ) external view returns (uint256) {
        uint256 d = SwapUtilsV2.getD(
            _xp(
                self.balances,
                self.tokenPrecisionMultipliers,
                _getBaseVirtualPrice(metaSwapStorage)
            ),
            self._getAPrecise()
        );
        uint256 supply = self.lpToken.totalSupply();
        if (supply != 0) {
            return (d * BASE_VIRTUAL_PRICE_PRECISION) / supply;
        }
        return 0;
    }

    /**
     * @notice Externally calculates a swap between two tokens. The SwapUtils.Swap storage and
     * MetaSwap storage should be from the same MetaSwap contract.
     * @param self Swap struct to read from
     * @param metaSwapStorage MetaSwap struct from the same contract
     * @param tokenIndexFrom the token to sell
     * @param tokenIndexTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @return dy the number of tokens the user will get
     */
    function calculateSwap(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx
    ) external view returns (uint256 dy) {
        (dy, ) = _calculateSwap(
            self,
            tokenIndexFrom,
            tokenIndexTo,
            dx,
            _getBaseVirtualPrice(metaSwapStorage)
        );
    }

    /**
     * @notice Internally calculates a swap between two tokens.
     *
     * @dev The caller is expected to transfer the actual amounts (dx and dy)
     * using the token contracts.
     *
     * @param self Swap struct to read from
     * @param tokenIndexFrom the token to sell
     * @param tokenIndexTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param baseVirtualPrice the virtual price of the base LP token
     * @return dy the number of tokens the user will get and dyFee the associated fee
     */
    function _calculateSwap(
        SwapUtilsV2.Swap storage self,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 baseVirtualPrice
    ) internal view returns (uint256 dy, uint256 dyFee) {
        uint256[] memory xp = _xp(self, baseVirtualPrice);
        require(
            tokenIndexFrom < xp.length && tokenIndexTo < xp.length,
            "Token index out of range"
        );
        uint256 baseLPTokenIndex = xp.length - 1;

        uint256 x = dx * self.tokenPrecisionMultipliers[tokenIndexFrom];
        if (tokenIndexFrom == baseLPTokenIndex) {
            // When swapping from a base Swap token, scale up dx by its virtual price
            x = (x * baseVirtualPrice) / BASE_VIRTUAL_PRICE_PRECISION;
        }
        x = x + xp[tokenIndexFrom];

        uint256 y = SwapUtilsV2.getY(
            self._getAPrecise(),
            tokenIndexFrom,
            tokenIndexTo,
            x,
            xp
        );
        dy = xp[tokenIndexTo] - y - 1;

        if (tokenIndexTo == baseLPTokenIndex) {
            // When swapping to a base Swap token, scale down dy by its virtual price
            dy = (dy * BASE_VIRTUAL_PRICE_PRECISION) / baseVirtualPrice;
        }

        dyFee = (dy * self.swapFee) / FEE_DENOMINATOR;
        dy = dy - dyFee;

        dy = dy / self.tokenPrecisionMultipliers[tokenIndexTo];
    }

    /**
     * @notice Calculates the expected return amount from swapping between
     * the pooled tokens and the underlying tokens of the base Swap pool.
     *
     * @param self Swap struct to read from
     * @param metaSwapStorage MetaSwap struct from the same contract
     * @param tokenIndexFrom the token to sell
     * @param tokenIndexTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @return dy the number of tokens the user will get
     */
    function calculateSwapUnderlying(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx
    ) external view returns (uint256) {
        CalculateSwapUnderlyingInfo memory v = CalculateSwapUnderlyingInfo(
            _getBaseVirtualPrice(metaSwapStorage),
            metaSwapStorage.baseSwap,
            0,
            uint8(metaSwapStorage.baseTokens.length),
            0,
            0,
            0
        );

        uint256[] memory xp = _xp(self, v.baseVirtualPrice);
        v.baseLPTokenIndex = uint8(xp.length - 1);
        {
            uint8 maxRange = v.baseLPTokenIndex + v.baseTokensLength;
            require(
                tokenIndexFrom < maxRange && tokenIndexTo < maxRange,
                "Token index out of range"
            );
        }

        if (tokenIndexFrom < v.baseLPTokenIndex) {
            // tokenFrom is from this pool
            v.x =
                xp[tokenIndexFrom] +
                (dx * self.tokenPrecisionMultipliers[tokenIndexFrom]);
        } else {
            // tokenFrom is from the base pool
            tokenIndexFrom = tokenIndexFrom - v.baseLPTokenIndex;
            if (tokenIndexTo < v.baseLPTokenIndex) {
                uint256[] memory baseInputs = new uint256[](v.baseTokensLength);
                baseInputs[tokenIndexFrom] = dx;
                v.x =
                    (v.baseSwap.calculateTokenAmount(baseInputs, true) *
                        v.baseVirtualPrice) /
                    BASE_VIRTUAL_PRICE_PRECISION;
                // when adding to the base pool,you pay approx 50% of the swap fee
                v.x =
                    v.x -
                    ((v.x * _getBaseSwapFee(metaSwapStorage.baseSwap)) /
                        (FEE_DENOMINATOR * 2)) +
                    xp[v.baseLPTokenIndex];
            } else {
                // both from and to are from the base pool
                return
                    v.baseSwap.calculateSwap(
                        tokenIndexFrom,
                        tokenIndexTo - v.baseLPTokenIndex,
                        dx
                    );
            }
            tokenIndexFrom = v.baseLPTokenIndex;
        }

        v.metaIndexTo = v.baseLPTokenIndex;
        if (tokenIndexTo < v.baseLPTokenIndex) {
            v.metaIndexTo = tokenIndexTo;
        }

        {
            uint256 y = SwapUtilsV2.getY(
                self._getAPrecise(),
                tokenIndexFrom,
                v.metaIndexTo,
                v.x,
                xp
            );
            v.dy = xp[v.metaIndexTo] - y - 1;
            uint256 dyFee = (v.dy * self.swapFee) / FEE_DENOMINATOR;
            v.dy = v.dy - dyFee;
        }

        if (tokenIndexTo < v.baseLPTokenIndex) {
            // tokenTo is from this pool
            v.dy = v.dy / self.tokenPrecisionMultipliers[v.metaIndexTo];
        } else {
            // tokenTo is from the base pool
            v.dy = v.baseSwap.calculateRemoveLiquidityOneToken(
                (v.dy * BASE_VIRTUAL_PRICE_PRECISION) / v.baseVirtualPrice,
                tokenIndexTo - v.baseLPTokenIndex
            );
        }

        return v.dy;
    }

    /**
     * @notice A simple method to calculate prices from deposits or
     * withdrawals, excluding fees but including slippage. This is
     * helpful as an input into the various "min" parameters on calls
     * to fight front-running
     *
     * @dev This shouldn't be used outside frontends for user estimates.
     *
     * @param self Swap struct to read from
     * @param metaSwapStorage MetaSwap struct to read from
     * @param amounts an array of token amounts to deposit or withdrawal,
     * corresponding to pooledTokens. The amount should be in each
     * pooled token's native precision. If a token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param deposit whether this is a deposit or a withdrawal
     * @return if deposit was true, total amount of lp token that will be minted and if
     * deposit was false, total amount of lp token that will be burned
     */
    function calculateTokenAmount(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256) {
        uint256 a = self._getAPrecise();
        uint256 d0;
        uint256 d1;
        {
            uint256 baseVirtualPrice = _getBaseVirtualPrice(metaSwapStorage);
            uint256[] memory balances1 = self.balances;
            uint256[] memory tokenPrecisionMultipliers = self
                .tokenPrecisionMultipliers;
            uint256 numTokens = balances1.length;
            d0 = SwapUtilsV2.getD(
                _xp(balances1, tokenPrecisionMultipliers, baseVirtualPrice),
                a
            );
            for (uint256 i = 0; i < numTokens; i++) {
                if (deposit) {
                    balances1[i] = balances1[i] + amounts[i];
                } else {
                    if (amounts[i] > balances1[i]) {
                        revert("Cannot withdraw more than available");
                    } else {
                        unchecked {
                            balances1[i] = balances1[i] - amounts[i];
                        }
                    }
                }
            }
            d1 = SwapUtilsV2.getD(
                _xp(balances1, tokenPrecisionMultipliers, baseVirtualPrice),
                a
            );
        }
        uint256 totalSupply = self.lpToken.totalSupply();

        if (deposit) {
            return ((d1 - d0) * totalSupply) / d0;
        } else {
            return ((d0 - d1) * totalSupply) / d0;
        }
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice swap two tokens in the pool
     * @param self Swap struct to read from and write to
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell
     * @param minDy the min amount the user would like to receive, or revert.
     * @return amount of token user received on swap
     */
    function swap(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy
    ) external returns (uint256) {
        {
            uint256 pooledTokensLength = self.pooledTokens.length;
            require(
                tokenIndexFrom < pooledTokensLength &&
                    tokenIndexTo < pooledTokensLength,
                "Token index is out of range"
            );
        }

        uint256 transferredDx;
        {
            IERC20 tokenFrom = self.pooledTokens[tokenIndexFrom];
            require(
                dx <= tokenFrom.balanceOf(msg.sender),
                "Cannot swap more than you own"
            );

            {
                // Transfer tokens first to see if a fee was charged on transfer
                uint256 beforeBalance = tokenFrom.balanceOf(address(this));
                tokenFrom.safeTransferFrom(msg.sender, address(this), dx);

                // Use the actual transferred amount for AMM math
                transferredDx =
                    tokenFrom.balanceOf(address(this)) -
                    beforeBalance;
            }
        }

        (uint256 dy, uint256 dyFee) = _calculateSwap(
            self,
            tokenIndexFrom,
            tokenIndexTo,
            transferredDx,
            _updateBaseVirtualPrice(metaSwapStorage)
        );
        require(dy >= minDy, "Swap didn't result in min tokens");

        uint256 dyAdminFee = (dyFee * self.adminFee) /
            FEE_DENOMINATOR /
            self.tokenPrecisionMultipliers[tokenIndexTo];

        self.balances[tokenIndexFrom] =
            self.balances[tokenIndexFrom] +
            transferredDx;
        self.balances[tokenIndexTo] =
            self.balances[tokenIndexTo] -
            dy -
            dyAdminFee;

        self.pooledTokens[tokenIndexTo].safeTransfer(msg.sender, dy);

        emit TokenSwap(
            msg.sender,
            transferredDx,
            dy,
            tokenIndexFrom,
            tokenIndexTo
        );

        return dy;
    }

    /**
     * @notice Swaps with the underlying tokens of the base Swap pool. For this function,
     * the token indices are flattened out so that underlying tokens are represented
     * in the indices.
     * @dev Since this calls multiple external functions during the execution,
     * it is recommended to protect any function that depends on this with reentrancy guards.
     * @param self Swap struct to read from and write to
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @param tokenIndexFrom the token the user wants to sell
     * @param tokenIndexTo the token the user wants to buy
     * @param dx the amount of tokens the user wants to sell
     * @param minDy the min amount the user would like to receive, or revert.
     * @return amount of token user received on swap
     */
    function swapUnderlying(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy
    ) external returns (uint256) {
        SwapUnderlyingInfo memory v = SwapUnderlyingInfo(
            0,
            0,
            0,
            self.tokenPrecisionMultipliers,
            self.balances,
            metaSwapStorage.baseTokens,
            IERC20(address(0)),
            0,
            IERC20(address(0)),
            0,
            _updateBaseVirtualPrice(metaSwapStorage)
        );

        uint8 baseLPTokenIndex = uint8(v.oldBalances.length - 1);

        {
            uint8 maxRange = uint8(baseLPTokenIndex + v.baseTokens.length);
            require(
                tokenIndexFrom < maxRange && tokenIndexTo < maxRange,
                "Token index out of range"
            );
        }

        ISwapV2 baseSwap = metaSwapStorage.baseSwap;

        // Find the address of the token swapping from and the index in MetaSwap's token list
        if (tokenIndexFrom < baseLPTokenIndex) {
            v.tokenFrom = self.pooledTokens[tokenIndexFrom];
            v.metaIndexFrom = tokenIndexFrom;
        } else {
            v.tokenFrom = v.baseTokens[tokenIndexFrom - baseLPTokenIndex];
            v.metaIndexFrom = baseLPTokenIndex;
        }

        // Find the address of the token swapping to and the index in MetaSwap's token list
        if (tokenIndexTo < baseLPTokenIndex) {
            v.tokenTo = self.pooledTokens[tokenIndexTo];
            v.metaIndexTo = tokenIndexTo;
        } else {
            v.tokenTo = v.baseTokens[tokenIndexTo - baseLPTokenIndex];
            v.metaIndexTo = baseLPTokenIndex;
        }

        // Check for possible fee on transfer
        v.dx = v.tokenFrom.balanceOf(address(this));
        v.tokenFrom.safeTransferFrom(msg.sender, address(this), dx);
        v.dx = v.tokenFrom.balanceOf(address(this)) - v.dx; // update dx in case of fee on transfer

        if (
            tokenIndexFrom < baseLPTokenIndex || tokenIndexTo < baseLPTokenIndex
        ) {
            // Either one of the tokens belongs to the MetaSwap tokens list
            uint256[] memory xp = _xp(
                v.oldBalances,
                v.tokenPrecisionMultipliers,
                v.baseVirtualPrice
            );

            if (tokenIndexFrom < baseLPTokenIndex) {
                // Swapping from a MetaSwap token
                v.x =
                    xp[tokenIndexFrom] +
                    (dx * v.tokenPrecisionMultipliers[tokenIndexFrom]);
            } else {
                // Swapping from one of the tokens hosted in the base Swap
                // This case requires adding the underlying token to the base Swap, then
                // using the base LP token to swap to the desired token
                uint256[] memory baseAmounts = new uint256[](
                    v.baseTokens.length
                );
                baseAmounts[tokenIndexFrom - baseLPTokenIndex] = v.dx;

                // Add liquidity to the base Swap contract and receive base LP token
                v.dx = baseSwap.addLiquidity(baseAmounts, 0, block.timestamp);

                // Calculate the value of total amount of baseLPToken we end up with
                v.x =
                    ((v.dx * v.baseVirtualPrice) /
                        BASE_VIRTUAL_PRICE_PRECISION) +
                    xp[baseLPTokenIndex];
            }

            // Calculate how much to withdraw in MetaSwap level and the the associated swap fee
            uint256 dyFee;
            {
                uint256 y = SwapUtilsV2.getY(
                    self._getAPrecise(),
                    v.metaIndexFrom,
                    v.metaIndexTo,
                    v.x,
                    xp
                );
                v.dy = xp[v.metaIndexTo] - y - 1;
                if (tokenIndexTo >= baseLPTokenIndex) {
                    // When swapping to a base Swap token, scale down dy by its virtual price
                    v.dy =
                        (v.dy * BASE_VIRTUAL_PRICE_PRECISION) /
                        v.baseVirtualPrice;
                }
                dyFee = (v.dy * self.swapFee) / FEE_DENOMINATOR;
                v.dy =
                    (v.dy - dyFee) /
                    v.tokenPrecisionMultipliers[v.metaIndexTo];
            }

            // Update the balances array according to the calculated input and output amount
            {
                uint256 dyAdminFee = (dyFee * self.adminFee) / FEE_DENOMINATOR;
                dyAdminFee =
                    dyAdminFee /
                    v.tokenPrecisionMultipliers[v.metaIndexTo];
                self.balances[v.metaIndexFrom] =
                    v.oldBalances[v.metaIndexFrom] +
                    v.dx;
                self.balances[v.metaIndexTo] =
                    v.oldBalances[v.metaIndexTo] -
                    v.dy -
                    dyAdminFee;
            }

            if (tokenIndexTo >= baseLPTokenIndex) {
                // When swapping to a token that belongs to the base Swap, burn the LP token
                // and withdraw the desired token from the base pool
                uint256 oldBalance = v.tokenTo.balanceOf(address(this));
                baseSwap.removeLiquidityOneToken(
                    v.dy,
                    tokenIndexTo - baseLPTokenIndex,
                    0,
                    block.timestamp
                );
                v.dy = v.tokenTo.balanceOf(address(this)) - oldBalance;
            }

            // Check the amount of token to send meets minDy
            require(v.dy >= minDy, "Swap didn't result in min tokens");
        } else {
            // Both tokens are from the base Swap pool
            // Do a swap through the base Swap
            v.dy = v.tokenTo.balanceOf(address(this));
            baseSwap.swap(
                tokenIndexFrom - baseLPTokenIndex,
                tokenIndexTo - baseLPTokenIndex,
                v.dx,
                minDy,
                block.timestamp
            );
            v.dy = v.tokenTo.balanceOf(address(this)) - v.dy;
        }

        // Send the desired token to the caller
        v.tokenTo.safeTransfer(msg.sender, v.dy);

        emit TokenSwapUnderlying(
            msg.sender,
            dx,
            v.dy,
            tokenIndexFrom,
            tokenIndexTo
        );

        return v.dy;
    }

    /**
     * @notice Add liquidity to the pool
     * @param self Swap struct to read from and write to
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @param amounts the amounts of each token to add, in their native precision
     * @param minToMint the minimum LP tokens adding this amount of liquidity
     * should mint, otherwise revert. Handy for front-running mitigation
     * allowed addresses. If the pool is not in the guarded launch phase, this parameter will be ignored.
     * @return amount of LP token user received
     */
    function addLiquidity(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint256[] memory amounts,
        uint256 minToMint
    ) external returns (uint256) {
        IERC20[] memory pooledTokens = self.pooledTokens;
        require(
            amounts.length == pooledTokens.length,
            "Amounts must match pooled tokens"
        );

        uint256[] memory fees = new uint256[](pooledTokens.length);

        // current state
        ManageLiquidityInfo memory v = ManageLiquidityInfo(
            0,
            0,
            0,
            self.lpToken,
            0,
            self._getAPrecise(),
            _updateBaseVirtualPrice(metaSwapStorage),
            self.tokenPrecisionMultipliers,
            self.balances
        );
        v.totalSupply = v.lpToken.totalSupply();

        if (v.totalSupply != 0) {
            v.d0 = SwapUtilsV2.getD(
                _xp(
                    v.newBalances,
                    v.tokenPrecisionMultipliers,
                    v.baseVirtualPrice
                ),
                v.preciseA
            );
        }

        for (uint256 i = 0; i < pooledTokens.length; i++) {
            require(
                v.totalSupply != 0 || amounts[i] > 0,
                "Must supply all tokens in pool"
            );

            // Transfer tokens first to see if a fee was charged on transfer
            if (amounts[i] != 0) {
                uint256 beforeBalance = pooledTokens[i].balanceOf(
                    address(this)
                );
                pooledTokens[i].safeTransferFrom(
                    msg.sender,
                    address(this),
                    amounts[i]
                );

                // Update the amounts[] with actual transfer amount
                amounts[i] =
                    pooledTokens[i].balanceOf(address(this)) -
                    beforeBalance;
            }

            v.newBalances[i] = v.newBalances[i] + amounts[i];
        }

        // invariant after change
        v.d1 = SwapUtilsV2.getD(
            _xp(v.newBalances, v.tokenPrecisionMultipliers, v.baseVirtualPrice),
            v.preciseA
        );
        require(v.d1 > v.d0, "D should increase");

        // updated to reflect fees and calculate the user's LP tokens
        v.d2 = v.d1;
        uint256 toMint;

        if (v.totalSupply != 0) {
            uint256 feePerToken = SwapUtilsV2._feePerToken(
                self.swapFee,
                pooledTokens.length
            );
            for (uint256 i = 0; i < pooledTokens.length; i++) {
                uint256 idealBalance = (v.d1 * self.balances[i]) / v.d0;
                fees[i] =
                    (feePerToken *
                        (idealBalance.difference(v.newBalances[i]))) /
                    FEE_DENOMINATOR;
                self.balances[i] =
                    v.newBalances[i] -
                    ((fees[i] * self.adminFee) / FEE_DENOMINATOR);
                v.newBalances[i] = v.newBalances[i] - fees[i];
            }
            v.d2 = SwapUtilsV2.getD(
                _xp(
                    v.newBalances,
                    v.tokenPrecisionMultipliers,
                    v.baseVirtualPrice
                ),
                v.preciseA
            );
            toMint = ((v.d2 - v.d0) * v.totalSupply) / v.d0;
        } else {
            // the initial depositor doesn't pay fees
            self.balances = v.newBalances;
            toMint = v.d1;
        }

        require(toMint >= minToMint, "Couldn't mint min requested");

        // mint the user's LP tokens
        self.lpToken.mint(msg.sender, toMint);

        emit AddLiquidity(
            msg.sender,
            amounts,
            fees,
            v.d1,
            v.totalSupply + toMint
        );

        return toMint;
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param self Swap struct to read from and write to
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @param tokenAmount the amount of the lp tokens to burn
     * @param tokenIndex the index of the token you want to receive
     * @param minAmount the minimum amount to withdraw, otherwise revert
     * @return amount chosen token that user received
     */
    function removeLiquidityOneToken(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount
    ) external returns (uint256) {
        LPTokenV2 lpToken = self.lpToken;
        uint256 totalSupply = lpToken.totalSupply();
        uint256 numTokens = self.pooledTokens.length;
        require(tokenAmount <= lpToken.balanceOf(msg.sender), ">LP.balanceOf");
        require(tokenIndex < numTokens, "Token not found");

        uint256 dyFee;
        uint256 dy;

        (dy, dyFee) = _calculateWithdrawOneToken(
            self,
            tokenAmount,
            tokenIndex,
            _updateBaseVirtualPrice(metaSwapStorage),
            totalSupply
        );

        require(dy >= minAmount, "dy < minAmount");

        // Update balances array
        self.balances[tokenIndex] =
            self.balances[tokenIndex] -
            (dy + ((dyFee * self.adminFee) / FEE_DENOMINATOR));

        // Burn the associated LP token from the caller and send the desired token
        lpToken.burnFrom(msg.sender, tokenAmount);
        self.pooledTokens[tokenIndex].safeTransfer(msg.sender, dy);

        emit RemoveLiquidityOne(
            msg.sender,
            tokenAmount,
            totalSupply,
            tokenIndex,
            dy
        );

        return dy;
    }

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     * pool's current balances.
     *
     * @param self Swap struct to read from and write to
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @param amounts how much of each token to withdraw
     * @param maxBurnAmount the max LP token provider is willing to pay to
     * remove liquidity. Useful as a front-running mitigation.
     * @return actual amount of LP tokens burned in the withdrawal
     */
    function removeLiquidityImbalance(
        SwapUtilsV2.Swap storage self,
        MetaSwap storage metaSwapStorage,
        uint256[] memory amounts,
        uint256 maxBurnAmount
    ) public returns (uint256) {
        // Using this struct to avoid stack too deep error
        ManageLiquidityInfo memory v = ManageLiquidityInfo(
            0,
            0,
            0,
            self.lpToken,
            0,
            self._getAPrecise(),
            _updateBaseVirtualPrice(metaSwapStorage),
            self.tokenPrecisionMultipliers,
            self.balances
        );
        v.totalSupply = v.lpToken.totalSupply();

        require(
            amounts.length == v.newBalances.length,
            "Amounts should match pool tokens"
        );
        require(maxBurnAmount != 0, "Must burn more than 0");

        uint256 feePerToken = SwapUtilsV2._feePerToken(
            self.swapFee,
            v.newBalances.length
        );

        // Calculate how much LPToken should be burned
        uint256[] memory fees = new uint256[](v.newBalances.length);
        {
            uint256[] memory balances1 = new uint256[](v.newBalances.length);

            v.d0 = SwapUtilsV2.getD(
                _xp(
                    v.newBalances,
                    v.tokenPrecisionMultipliers,
                    v.baseVirtualPrice
                ),
                v.preciseA
            );
            for (uint256 i = 0; i < v.newBalances.length; i++) {
                if (amounts[i] > v.newBalances[i]) {
                    revert("Cannot withdraw more than available");
                } else {
                    unchecked {
                        balances1[i] = v.newBalances[i] - amounts[i];
                    }
                }
            }
            v.d1 = SwapUtilsV2.getD(
                _xp(balances1, v.tokenPrecisionMultipliers, v.baseVirtualPrice),
                v.preciseA
            );

            for (uint256 i = 0; i < v.newBalances.length; i++) {
                uint256 idealBalance = (v.d1 * v.newBalances[i]) / v.d0;
                uint256 difference = idealBalance.difference(balances1[i]);
                fees[i] = (feePerToken * difference) / FEE_DENOMINATOR;
                self.balances[i] =
                    balances1[i] -
                    ((fees[i] * self.adminFee) / FEE_DENOMINATOR);
                balances1[i] = balances1[i] - fees[i];
            }

            v.d2 = SwapUtilsV2.getD(
                _xp(balances1, v.tokenPrecisionMultipliers, v.baseVirtualPrice),
                v.preciseA
            );
        }

        uint256 tokenAmount = ((v.d0 - v.d2) * v.totalSupply) / v.d0;
        require(tokenAmount != 0, "Burnt amount cannot be zero");

        // Scale up by withdraw fee
        tokenAmount = tokenAmount + 1;

        // Check for max burn amount
        require(tokenAmount <= maxBurnAmount, "tokenAmount > maxBurnAmount");

        // Burn the calculated amount of LPToken from the caller and send the desired tokens
        v.lpToken.burnFrom(msg.sender, tokenAmount);
        for (uint256 i = 0; i < v.newBalances.length; i++) {
            self.pooledTokens[i].safeTransfer(msg.sender, amounts[i]);
        }

        emit RemoveLiquidityImbalance(
            msg.sender,
            amounts,
            fees,
            v.d1,
            v.totalSupply - tokenAmount
        );

        return tokenAmount;
    }

    /**
     * @notice Determines if the stored value of base Swap's virtual price is expired.
     * If the last update was past the BASE_CACHE_EXPIRE_TIME, then update the stored value.
     *
     * @param metaSwapStorage MetaSwap struct to read from and write to
     * @return base Swap's virtual price
     */
    function _updateBaseVirtualPrice(MetaSwap storage metaSwapStorage)
        internal
        returns (uint256)
    {
        if (
            block.timestamp >
            metaSwapStorage.baseCacheLastUpdated + BASE_CACHE_EXPIRE_TIME
        ) {
            // When the cache is expired, update it
            uint256 baseVirtualPrice = ISwapV2(metaSwapStorage.baseSwap)
                .getVirtualPrice();
            metaSwapStorage.baseVirtualPrice = baseVirtualPrice;
            metaSwapStorage.baseCacheLastUpdated = block.timestamp;
            return baseVirtualPrice;
        } else {
            return metaSwapStorage.baseVirtualPrice;
        }
    }
}
