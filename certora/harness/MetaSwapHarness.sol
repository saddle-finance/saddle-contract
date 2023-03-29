pragma solidity ^0.6.0;

import "../munged/meta/MetaSwap.sol";

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract MetaSwapHarness is MetaSwap {

    LPToken public lpToken = swapStorage.lpToken;
    IERC20 public token0 = swapStorage.pooledTokens[0];
    IERC20 public token1 = swapStorage.pooledTokens[1];

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

    function getBaseSwapPaused() public view returns(bool) {
        return ISwap(metaSwapStorage.baseSwap).paused();
    }

}