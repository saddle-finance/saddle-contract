pragma solidity ^0.5.11;

import "@openzeppelin/contracts/math/SafeMath.sol";

library MathUtils {
    using SafeMath for uint256;

    function within1(uint a, uint b) public pure returns (bool) {
        if (a > b) {
            if (a.sub(b) <= 1) {
                return true;
            }
        } else {
            if (b.sub(a) <= 1) {
                return true;
            }
        }
        return false;
    }

    function difference(uint a, uint b) public pure returns (uint256) {
        if (a > b) {
            return a.sub(b);
        }
        return b.sub(a);
    }
}
