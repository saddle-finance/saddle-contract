// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../MathUtils.sol";
import "../interfaces/ISwap.sol";
import "../helper/BaseBoringBatchable.sol";

interface IERC20Decimals {
    function decimals() external returns (uint8);
}

/**
 * @title SwapCalculator
 * @notice A contract to help calculate exact input and output amounts for a swap. Supports pools with ISwap interfaces.
 * Additionally includes functions to calculate with arbitrary balances, A parameter, and swap fee.
 */
contract SwapCalculator is BaseBoringBatchable {
    using SafeMath for uint256;
    using MathUtils for uint256;

    // Constant values
    uint256 private constant BALANCE_PRECISION = 1e18;
    uint256 private constant BALANCE_DECIMALS = 18;
    uint256 private constant A_PRECISION = 100;
    uint256 private constant MAX_LOOP_LIMIT = 256;
    uint256 private constant MAX_TOKENS_LENGTH = 8;
    uint256 private constant FEE_DENOMINATOR = 10**10;

    mapping(address => uint256[]) public storedDecimals;

    /**
     * @notice Calculate the expected output amount for given pool, indexes, and input amount
     * @param pool address of a pool contract that implements ISwap
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @param inputAmount amount of input token to swap
     * @return outputAmount expected output amount
     */
    function calculateSwapOutput(
        address pool,
        uint256 inputIndex,
        uint256 outputIndex,
        uint256 inputAmount
    ) external view returns (uint256 outputAmount) {
        outputAmount = ISwap(pool).calculateSwap(
            uint8(inputIndex),
            uint8(outputIndex),
            inputAmount
        );
    }

    /**
     * @notice Calculate the expected input amount for given pool, indexes, and out amount
     * @param pool address of a pool contract that implements ISwap
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @param outputAmount desired amount of output token to receive on swap
     * @return inputAmount expected input amount
     */
    function calculateSwapInput(
        address pool,
        uint256 inputIndex,
        uint256 outputIndex,
        uint256 outputAmount
    ) external view returns (uint256 inputAmount) {
        uint256[] memory decimalsArr = storedDecimals[pool];
        require(decimalsArr.length > 0, "Must call addPool() first");

        uint256[] memory balances = new uint256[](decimalsArr.length);
        for (uint256 i = 0; i < decimalsArr.length; i++) {
            uint256 multiplier = 10**BALANCE_DECIMALS.sub(decimalsArr[i]);
            balances[i] = ISwap(pool).getTokenBalance(uint8(i)).mul(multiplier);
        }
        outputAmount = outputAmount.mul(
            10**BALANCE_DECIMALS.sub(decimalsArr[outputIndex])
        );

        (, , , , uint256 swapFee, , ) = ISwap(pool).swapStorage();

        inputAmount = calculateSwapInputCustom(
            balances,
            ISwap(pool).getAPrecise(),
            swapFee,
            inputIndex,
            outputIndex,
            outputAmount
        ).div(10**BALANCE_DECIMALS.sub(decimalsArr[inputIndex]));
    }

    /**
     * @notice Calculates the relative price between two assets in a pool
     * @param pool address of a pool contract that implements ISwap
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @return price relative price of output tokens per one input token
     */
    function relativePrice(
        address pool,
        uint256 inputIndex,
        uint256 outputIndex
    ) external view returns (uint256 price) {
        uint256[] memory decimalsArr = storedDecimals[pool];
        require(decimalsArr.length > 0, "Must call addPool() first");

        uint256[] memory balances = new uint256[](decimalsArr.length);
        for (uint256 i = 0; i < decimalsArr.length; i++) {
            uint256 multiplier = 10**BALANCE_DECIMALS.sub(decimalsArr[i]);
            balances[i] = ISwap(pool).getTokenBalance(uint8(i)).mul(multiplier);
        }

        price = relativePriceCustom(
            balances,
            ISwap(pool).getAPrecise(),
            inputIndex,
            outputIndex
        );
    }

    /**
     * @notice Calculate the expected input amount for given balances, A, swap fee, indexes, and out amount
     * @dev Uses 1e18 precision for balances, 1e2 for A, and 1e10 for swap fee
     * @param balances array of balances
     * @param a A parameter to be used in the calculation
     * @param swapFee fee to be charged per swap
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @param inputAmount amount of input token to swap
     * @return outputAmount expected output amount
     */
    function calculateSwapOutputCustom(
        uint256[] memory balances,
        uint256 a,
        uint256 swapFee,
        uint256 inputIndex,
        uint256 outputIndex,
        uint256 inputAmount
    ) public pure returns (uint256 outputAmount) {
        require(
            inputIndex < balances.length && outputIndex < balances.length,
            "Invalid token index"
        );
        // Calculate the swap
        uint256 x = inputAmount.add(balances[inputIndex]);
        uint256 y = getY(a, inputIndex, outputIndex, x, balances);
        outputAmount = balances[outputIndex].sub(y).sub(1);

        // Simulate the swap fee
        uint256 fee = outputAmount.mul(swapFee).div(FEE_DENOMINATOR);
        outputAmount = outputAmount.sub(fee);
    }

    /**
     * @notice Calculate the expected input amount for given balances, A, swap fee, indexes, and out amount
     * @dev Uses 1e18 precision for balances, 1e2 for A, and 1e10 for swap fee
     * @param balances array of balances
     * @param a A parameter to be used in the calculation
     * @param swapFee fee to be charged per swap
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @param outputAmount desired amount of output token to receive on swap
     * @return inputAmount expected input amount
     */
    function calculateSwapInputCustom(
        uint256[] memory balances,
        uint256 a,
        uint256 swapFee,
        uint256 inputIndex,
        uint256 outputIndex,
        uint256 outputAmount
    ) public pure returns (uint256 inputAmount) {
        require(
            inputIndex < balances.length && outputIndex < balances.length,
            "Invalid token index"
        );

        // Simulate the swap fee
        uint256 fee = outputAmount.mul(swapFee).div(
            FEE_DENOMINATOR.sub(swapFee)
        );
        outputAmount = outputAmount.add(fee);

        // Calculate the swap
        uint256 y = balances[outputIndex].sub(outputAmount);
        uint256 x = getX(a, inputIndex, outputIndex, y, balances);
        inputAmount = x.sub(balances[inputIndex]).add(1);
    }

    /**
     * @notice Calculate the relative price between two assets in given setup of balances and A
     * @dev Uses 1e18 precision for balances, 1e2 for A
     * @param balances array of balances
     * @param a A parameter to be used in the calculation
     * @param inputIndex index of the input token in the pool
     * @param outputIndex index of the output token in the pool
     * @return price relative price of output tokens per one input token
     */
    function relativePriceCustom(
        uint256[] memory balances,
        uint256 a,
        uint256 inputIndex,
        uint256 outputIndex
    ) public pure returns (uint256 price) {
        return
            calculateSwapOutputCustom(
                balances,
                a,
                0,
                inputIndex,
                outputIndex,
                BALANCE_PRECISION
            );
    }

    /**
     * @notice Add and registers a new pool. This function exist to cache decimal information.
     * @param pool address of a pool contract that implements ISwap
     */
    function addPool(address pool) external payable {
        uint256[] memory decimalsArr = new uint256[](MAX_TOKENS_LENGTH);

        for (uint256 i = 0; i < MAX_TOKENS_LENGTH; i++) {
            try ISwap(pool).getToken(uint8(i)) returns (IERC20 token) {
                require(address(token) != address(0), "Token invalid");
                decimalsArr[i] = IERC20Decimals(address(token)).decimals();
            } catch {
                assembly {
                    mstore(decimalsArr, sub(mload(decimalsArr), sub(8, i)))
                }
                break;
            }
        }

        require(decimalsArr.length > 0, "Must call addPool() first");
        storedDecimals[pool] = decimalsArr;
    }

    /**
     * @notice Get D, the StableSwap invariant, based on a set of balances and a particular A.
     * @param xp a precision-adjusted set of pool balances. Array should be the same cardinality
     * as the pool.
     * @param a the amplification coefficient * n * (n - 1) in A_PRECISION.
     * See the StableSwap paper for details
     * @return the invariant, at the precision of the pool
     */
    function getD(uint256[] memory xp, uint256 a)
        internal
        pure
        returns (uint256)
    {
        uint256 numTokens = xp.length;
        uint256 s;
        for (uint256 i = 0; i < numTokens; i++) {
            s = s.add(xp[i]);
        }
        if (s == 0) {
            return 0;
        }

        uint256 prevD;
        uint256 d = s;
        uint256 nA = a.mul(numTokens);

        for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
            uint256 dP = d;
            for (uint256 j = 0; j < numTokens; j++) {
                dP = dP.mul(d).div(xp[j].mul(numTokens));
                // If we were to protect the division loss we would have to keep the denominator separate
                // and divide at the end. However this leads to overflow with large numTokens or/and D.
                // dP = dP * D * D * D * ... overflow!
            }
            prevD = d;
            d = nA.mul(s).div(A_PRECISION).add(dP.mul(numTokens)).mul(d).div(
                nA.sub(A_PRECISION).mul(d).div(A_PRECISION).add(
                    numTokens.add(1).mul(dP)
                )
            );
            if (d.within1(prevD)) {
                return d;
            }
        }

        // Convergence should occur in 4 loops or less. If this is reached, there may be something wrong
        // with the pool. If this were to occur repeatedly, LPs should withdraw via `removeLiquidity()`
        // function which does not rely on D.
        revert("D does not converge");
    }

    /**
     * @notice Calculate the new balances of the tokens given the indexes of the token
     * that is swapped from (FROM) and the token that is swapped to (TO).
     * This function is used as a helper function to calculate how much TO token
     * the user should receive on swap.
     *
     * @param preciseA precise form of amplification coefficient
     * @param tokenIndexFrom index of FROM token
     * @param tokenIndexTo index of TO token
     * @param x the new total amount of FROM token
     * @param xp balances of the tokens in the pool
     * @return the amount of TO token that should remain in the pool
     */
    function getY(
        uint256 preciseA,
        uint256 tokenIndexFrom,
        uint256 tokenIndexTo,
        uint256 x,
        uint256[] memory xp
    ) internal pure returns (uint256) {
        uint256 numTokens = xp.length;
        require(
            tokenIndexFrom != tokenIndexTo,
            "Can't compare token to itself"
        );
        require(
            tokenIndexFrom < numTokens && tokenIndexTo < numTokens,
            "Tokens must be in pool"
        );

        uint256 d = getD(xp, preciseA);
        uint256 c = d;
        uint256 s;
        uint256 nA = numTokens.mul(preciseA);

        uint256 _x;
        for (uint256 i = 0; i < numTokens; i++) {
            if (i == tokenIndexFrom) {
                _x = x;
            } else if (i != tokenIndexTo) {
                _x = xp[i];
            } else {
                continue;
            }
            s = s.add(_x);
            c = c.mul(d).div(_x.mul(numTokens));
            // If we were to protect the division loss we would have to keep the denominator separate
            // and divide at the end. However this leads to overflow with large numTokens or/and D.
            // c = c * D * D * D * ... overflow!
        }
        c = c.mul(d).mul(A_PRECISION).div(nA.mul(numTokens));
        uint256 b = s.add(d.mul(A_PRECISION).div(nA));
        uint256 yPrev;
        uint256 y = d;

        // iterative approximation
        for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
            yPrev = y;
            y = y.mul(y).add(c).div(y.mul(2).add(b).sub(d));
            if (y.within1(yPrev)) {
                return y;
            }
        }
        revert("Approximation did not converge");
    }

    /**
     * @notice Calculate the new balances of the tokens given the indexes of the token
     * that is swapped from (FROM) and the token that is swapped to (TO).
     * This function is used as a helper function to calculate how much FROM token
     * the user will be required to transfer on swap.
     *
     * @param preciseA precise form of amplification coefficient
     * @param tokenIndexFrom index of FROM token
     * @param tokenIndexTo index of TO token
     * @param y the new total amount of TO token
     * @param xp balances of the tokens in the pool
     * @return the amount of FROM token that will be required
     */
    function getX(
        uint256 preciseA,
        uint256 tokenIndexFrom,
        uint256 tokenIndexTo,
        uint256 y,
        uint256[] memory xp
    ) internal pure returns (uint256) {
        return getY(preciseA, tokenIndexTo, tokenIndexFrom, y, xp);
    }
}
