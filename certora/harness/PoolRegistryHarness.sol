pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../munged/registries/PoolRegistry.sol";

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract PoolRegistryHarness is PoolRegistry {
    constructor(address admin, address poolOwner) PoolRegistry(admin, poolOwner) public payable {}

    function getPools(uint256 i) public view returns(PoolData memory) {
        return pools[i];
    }
    
    function getPoolsPoolAddress(uint256 i) public view returns (address) {
        return pools[i].poolAddress;
    } 
}

