pragma solidity ^0.6.0;

import "../munged/Swap.sol";

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract SwapHarness is Swap {
    LPToken public lpToken = swapStorage.lpToken;
    IERC20 public token0 = swapStorage.pooledTokens[0];
    IERC20 public token1 = swapStorage.pooledTokens[1];

    function inRampA() public view returns (bool) {
        return (block.timestamp >= swapStorage.initialATime &&
                block.timestamp < swapStorage.futureATime &&
                swapStorage.initialA != swapStorage.futureA);
    }

    function getSwapFee() public view returns(uint256) {
        return swapStorage.swapFee;
    }

    function getAdminFee() public view returns(uint256) {
        return swapStorage.adminFee;
    }

    function getTotalSupply() public view returns(uint256) {
        return swapStorage.lpToken.totalSupply();
    }

    function getMaxAdminFee() public view returns(uint256) {
        return SwapUtils.MAX_ADMIN_FEE;
    }

    function getMaxSwapFee() public view returns(uint256) {
        return SwapUtils.MAX_SWAP_FEE;
    }

    function balanceOfUnderlyingOfUser(address user, uint8 index) public view returns(uint256) {
        return getToken(index).balanceOf(user);
    }

    function balanceOfLPOfUser(address user) public view returns(uint256) {
        return swapStorage.lpToken.balanceOf(user);
    }

    function getSumOfUnderlyings() public view returns(uint256) {
        uint256 sum = 0;
        // loop iterations limited to 3, instead of `swapStorage.pooledTokens.length`
        for (uint8 i = 0; i < swapStorage.pooledTokens.length; i++) {
            sum = sum.add(swapStorage.balances[i]);
        }
        return sum;
    }

    function lengthsMatch() public view returns(bool) {
        return swapStorage.pooledTokens.length == swapStorage.balances.length;
    }

    function getLPTokenAddress() public view returns(address) {
        return address(swapStorage.lpToken);
    }

    function getMultiplier(uint256 index) public view returns(uint256) {
        require(swapStorage.tokenPrecisionMultipliers.length > index, "Token index out of range");
        return swapStorage.tokenPrecisionMultipliers[index];
    }
}
