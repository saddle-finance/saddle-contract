pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title MathUtils library
 * @notice A library to be used in conjuction with SafeMath. Contains functions for calculating
 * differences between two uint256 and checking if a uint256 is a power of 10.
 */
library MathUtils {
    using SafeMath for uint256;

    /**
     * @notice Compares a and b and returns true if the difference between a and b
     *         is less than 1 or equal to each other.
     * @param a uint256 to compare with
     * @param b uint256 to compare with
     * @return True if the difference between a and b is less than 1 or equal,
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

    /**
     * @notice Check whether n is a power of 10
     * @param n uint256 to check
     * @return True if n is a power of 10, otherwise return false
     */
    function pow10(uint256 n) public pure returns (bool) {
        while (n > 9 && n % 10 == 0)  {
            n = n / 10;
        }
        return (n == 1);
    }
}
