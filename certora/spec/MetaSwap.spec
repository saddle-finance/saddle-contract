/* 
    All properties that are proven for Swap are also proven for MetaSwap
*/

import "../helpers/erc20.spec"
using LPToken as lpToken

////////////////////////////////////////////////////////////////////////////
//                                Methods                                 //
////////////////////////////////////////////////////////////////////////////
methods {

    // harness functions
    getSwapFee() returns(uint256) envfree
    getAdminFee() returns(uint256) envfree
    getTotalSupply() returns(uint256) envfree
    getMaxAdminFee() returns(uint256) envfree
    getMaxSwapFee() returns(uint256) envfree
    getBaseSwapPaused() returns(bool) envfree

}

////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////

ghost mapping(uint256 => mapping(uint256 => uint256)) determinedInvariant;

/*
    Getting initialized variable
*/
ghost bool initialized {
    init_state axiom initialized == false;
}

hook Sload bool init _initialized STORAGE {
    require initialized == init;
}

/*
    Getting initializing variable
*/
ghost bool initializing {
    init_state axiom initializing == false;
}

hook Sload bool init _initializing STORAGE {
    require initializing == init;
}

// assume sum of all balances initially equals 0
ghost mathint sum_all_users_LP {
    init_state axiom sum_all_users_LP == 0;
}

// @dev A hook that keeps `sum_all_users_LP` up to date with the `_balances` mapping
hook Sstore lpToken._balances[KEY address user] uint256 balance (uint256 old_balance) STORAGE {
    sum_all_users_LP = sum_all_users_LP + balance - old_balance;
}

////////////////////////////////////////////////////////////////////////////
//                               Invariants                               //
////////////////////////////////////////////////////////////////////////////

/* 
    Sum of all users' LP balance must be equal to LP's `totalSupply`
    @dev fails on `swapUnderlying`
*/
invariant LPsolvency()
    getTotalSupply() == sum_all_users_LP



////////////////////////////////////////////////////////////////////////////
//                                 Rules                                  //
////////////////////////////////////////////////////////////////////////////

/* Notes:
    All properties that are proven for Swap are also proven for MetaSwap,
    therefore minimal need for additional rules
*/
rule MetaSwapLiveness() {
    require initialized == true;
    require initializing == false;
    require getTotalSupply() > 0;
    require getSwapFee() <= getMaxSwapFee();
    require getAdminFee() <= getMaxAdminFee();
    requireInvariant LPsolvency();

    
    require getBaseSwapPaused();

    env e;
    uint256 amount;
    uint256[] minAmounts;
    uint256 deadline;
    removeLiquidity@withrevert(e, amount, minAmounts, deadline);

    assert !lastReverted, "Users must be able to remove liquidity even when base swap contract is paused";
}


////////////////////////////////////////////////////////////////////////////
//                                Helpers                                 //
////////////////////////////////////////////////////////////////////////////