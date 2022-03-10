// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../MathUtils.sol";

contract SwapCalculator {
    using SafeMath for uint256;
    using MathUtils for uint256;

    // Constant values
    uint256 private constant A_PRECISION = 100;
    uint256 private constant MAX_LOOP_LIMIT = 256;
    uint256 private constant FEE_DENOMINATOR = 10**10;

    function calculateSwapOutput(
        uint256[] memory xp,
        uint256 a,
        uint256 swapFee,
        uint256 indexFrom,
        uint256 indexTo,
        uint256 amount
    ) external pure returns (uint256 dy) { 
        // Calculate the swap
        uint256 x = amount.add(xp[indexFrom]);
        uint256 y = getY(
            a,
            indexFrom,
            indexTo,
            x,
            xp
        );
        dy = xp[indexTo].sub(y).sub(1);

        // Simulate the swap fee
        uint256 dyFee = dy.mul(swapFee).div(FEE_DENOMINATOR);
        dy = dy.sub(dyFee);
    }

    function calculateSwapInput(
        uint256[] memory xp,
        uint256 a,
        uint256 swapFee,
        uint256 indexFrom,
        uint256 indexTo,
        uint256 amount
    )  external pure returns (uint256 dx) {
        // Simulate the swap fee
        uint256 dyFee = amount.mul(swapFee).div(FEE_DENOMINATOR.sub(swapFee));
        amount = amount.add(dyFee);

        // Calculate the swap
        uint256 y = xp[indexTo].sub(amount);
        uint256 x = getX(
            a,
            indexFrom,
            indexTo,
            y,
            xp
        );
        dx = x.sub(xp[indexFrom]).add(1);
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
            d = nA
                .mul(s)
                .div(A_PRECISION)
                .add(dP.mul(numTokens))
                .mul(d)
                .div(
                    nA
                        .sub(A_PRECISION)
                        .mul(d)
                        .div(A_PRECISION)
                        .add(numTokens.add(1).mul(dP))
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
     * This function is used as a helper function to calculate how much TO token
     * the user should receive on swap.
     *
     * @param preciseA precise form of amplification coefficient
     * @param tokenIndexFrom index of FROM token
     * @param tokenIndexTo index of TO token
     * @param y the new total amount of TO token
     * @param xp balances of the tokens in the pool
     * @return the amount of TO token that should remain in the pool
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
