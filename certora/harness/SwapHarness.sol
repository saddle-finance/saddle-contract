pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../munged/Swap.sol";

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract SwapHarness is Swap {
    
    /*function isInitialized() public view returns (bool) {
        return _initialized;
    }*/
    
    function inRampA() public view returns (bool) {
        return (block.timestamp >= swapStorage.initialATime &&
                block.timestamp < swapStorage.futureATime &&
                swapStorage.initialA != swapStorage.futureA);
    }

    function getPooledTokenAddress(uint256 index) public view returns (address) {
        return address(getToken(uint8(index)));
    }

}
