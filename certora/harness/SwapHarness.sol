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

    // refactoring addLiquidity in SwapUtils

    function addLiquidityHelper1(ManageLiquidityInfo memory v, IERC20[] memory pooledTokens,uint256[] memory amounts) public returns(uint256[] memory newBalances) {
        uint256[] memory newBalances = new uint256[](pooledTokens.length);

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
                amounts[i] = pooledTokens[i].balanceOf(address(this)).sub(
                    beforeBalance
                );
            }

            newBalances[i] = v.balances[i].add(amounts[i]);
        }
    }
}
