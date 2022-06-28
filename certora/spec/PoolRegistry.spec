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
    addCommunityPool(poolRegistry.PoolData) // PoolData struct = (address,address,uint8,bytes32,address,address[],address[],address,address,bool,bool,bool)
    approvePool(address)
    updatePool(poolRegistry.PoolData) //PoolData struct
    removePool(address)
    getPoolData(address) returns (poolRegistry.PoolData)
    getPoolDataAtIndex(uint256) returns (poolRegistry.PoolData)
    getPoolDataByName(bytes32) returns (poolRegistry.PoolData)
    getVirtualPrice(address) returns (uint256)
    getA(address) returns (uint256)
    getPaused(address) returns (bool)
    getSwapStorage(address) returns (poolRegistry.SwapStorageData) //SwapStorageData struct = (uint256,uint256,uint256,uint256,uint256,uint256,address)
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
    getPools(uint256) returns (poolRegistry.PoolData) envfree

    //  method summaries
    batch(bytes[], bool) // summarize as func that does nothing?
}

////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////

// TODO: add ghosts as necessary

////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

//
invariant uniquePools(uint256 i, uint256 j)
    i != j => getPools(i).poolAddress != getPools(j).poolAddress

// pool data at index i has address s.t. poolIndexPlusOne[address] = index + 1
invariant poolStorageConsistency(uint256 i, address x)
    getPools(i).poolAddress == x <=> poolsIndexOfPlusOne(x) == i + 1


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

