pragma solidity 0.5.17;

import "@openzeppelin/contracts/math/SafeMath.sol";

library MathUtils {
    using SafeMath for uint256;

    /**
     * @notice Calculates whether the difference between a and b are
     *         less than 1
     * @param a uint256 to compare with
     * @param b uint256 to compare with
     * @return True if the difference between a and b are less than 1,
     *         otherwise return false
     */
    function within1(uint256 a, uint256 b) external pure returns (bool) {
        return (_difference(a, b) <= 1);
    }

    /**
     * @notice Calculates absolute difference between a and b
     * @param a uint256 to compare with
     * @param b uint256 to compare with
     * @return Difference between a and b
     */
    function difference(uint256 a, uint256 b) external pure returns (uint256) {
        return _difference(a, b);
    }

    /**
     * @notice Calculates absolute difference between a and b
     * @param a uint256 to compare with
     * @param b uint256 to compare with
     * @return Difference between a and b
     */
    function _difference(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a > b) {
            return a.sub(b);
        }
        return b.sub(a);
    }
}
