/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/
*/

// using otherContractName as internalName
using PoolRegistryHarness as poolRegistry

////////////////////////////////////////////////////////////////////////////
//                      Methods                                           //
////////////////////////////////////////////////////////////////////////////

methods {
    // contract methods
    poolsIndexOfPlusOne(address) returns (uint256) envfree
    poolsIndexOfNamePlusOne(bytes32) returns (uint256)
    addPool(poolRegistry.PoolInputData) //PoolInputData struct = (address,uint8,bytes32,address,address,bool,bool,bool)
    approvePool(address)
    removePool(address)
    getVirtualPrice(address) returns (uint256)
    getA(address) returns (uint256)
    getPaused(address) returns (bool)
    getTokens(address) returns (address[]);
    getUnderlyingTokens(address) returns (address[])
    getPoolsLength() returns (uint256) envfree
    getEligiblePools(address, address) returns (address[])
    getTokenBalances(address) returns (uint256[])
    getUnderlyingTokenBalances(address) returns (uint256[])

    // variable getters
    SADDLE_MANAGER_ROLE() returns bytes32 envfree
    hasRole(bytes32, address) returns bool envfree
    

    // helper from the harness
    getPoolsPoolAddress(uint256) returns (address) envfree;
    //  method summaries
    batch(bytes[], bool) // summarize as func that does nothing?
    getConstantLength() returns(uint256) => ALWAYS(3); 

}

////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////

// TODO: add ghosts as necessary

////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

// unqiue pool per index
invariant uniquePools(uint256 i, uint256 j)
    i != j => getPoolsPoolAddress(i) != getPoolsPoolAddress(j)

// pool data at index i has address s.t. poolIndexPlusOne[address] = index + 1
invariant poolStorageConsistency(uint256 i, address x)
    getPoolsPoolAddress(i) == x <=> poolsIndexOfPlusOne(x) == i + 1


////////////////////////////////////////////////////////////////////////////
//                       Rules                                            //
////////////////////////////////////////////////////////////////////////////

// parametric rule
rule poolsLengthNonDecreasing(method f) filtered {f -> f.selector != batch(bytes[], bool).selector} {
    env e; calldataarg args;

    uint256 poolLengthBefore = getPoolsLength();
    f(e, args);
    uint256 poolLengthAfter = getPoolsLength();

    assert poolLengthAfter >= poolLengthBefore, "pool length must not decrease";
}

// implication rule
rule cantAddPoolTwice() {
    env e;
    poolRegistry.PoolInputData data;

    addPool(e, data);
    addPool@withrevert(e, data);

    assert lastReverted, "must not be able to add the same pool twice";
}

// only manager can remove pools
rule onlyManagerCanRemovePools() {
    address poolAddress;
    env e;

    removePool@withrevert(e, poolAddress);

    assert !lastReverted => hasRole(SADDLE_MANAGER_ROLE(), e.msg.sender);
}

////////////////////////////////////////////////////////////////////////////
//                       Helper                                  //
////////////////////////////////////////////////////////////////////////////

// TODO: Any additional helper 

