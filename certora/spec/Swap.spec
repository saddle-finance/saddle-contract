import "../helpers/erc20.spec"
using LPToken as lpToken

////////////////////////////////////////////////////////////////////////////
//                                Methods                                 //
////////////////////////////////////////////////////////////////////////////

methods {
    // newly declared function to help with summarization
    //getDApprox(uint256 xp1, uint256 xp2) returns(uint256) => newGetD(xp1,xp2);


    //// refactored functions
    //_addLiquidityHelper1((uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/a52c5cddea56000b3425/?anonymousKey=82df28494e920dd145c2164e630fb44f693947b9
    
    //_addLiquidityHelper2((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/4b56f3fe4454fcb081b7/?anonymousKey=97d9e5be959e5f453047964dbfd4056561b51e1c

    //_removeLiquidityImbalanceHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),uint256[]) returns (uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/02ffc66a1a1b6d58d17c/?anonymousKey=273372d8db6c060b54d76a192aa5233648d00c28
    
    //_removeLiquidityOneTokenHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),uint256,uint256,uint8) returns(uint256) => NONDET
    //https://vaas-stg.certora.com/output/93493/36b8abd73b5fba32a927/?anonymousKey=2f52ea8a6289c42eb2bbcee468b4b5202d06b76c

    // math functions summarized
	getD(uint256[], uint256) returns (uint256) => NONDET

    // normal functions
    
    owner() returns(address) envfree
    paused() returns(bool) envfree
    getA() returns (uint256) envfree
    getAPrecise() returns (uint256) envfree
    getToken(uint8) returns (address) envfree
    getTokenIndex(address) returns (uint8) envfree
    getTokenBalance(uint8) returns (uint256) envfree
    getVirtualPrice() returns (uint256) envfree
    calculateSwap(uint8,uint8,uint256) returns (uint256) envfree
    calculateTokenAmount(uint256[],bool) returns (uint256) envfree
    calculateRemoveLiquidity(uint256) returns (uint256[]) envfree
    calculateRemoveLiquidityOneToken(uint256,uint8) returns (uint256) envfree
    getAdminBalance(uint256) returns (uint256) envfree
    addLiquidity(uint256[], uint256, uint256) returns (uint256)
    swap(uint8,uint8,uint256,uint256,uint256) returns (uint256)
    removeLiquidity(uint256,uint256[],uint256)

    // harness functions
    getSwapFee() returns(uint256) envfree
    getAdminFee() returns(uint256) envfree
    getTotalSupply() returns(uint256) envfree
    getMaxAdminFee() returns(uint256) envfree
    getMaxSwapFee() returns(uint256) envfree
    balanceOfUnderlyingOfUser(address,uint8) returns(uint256) envfree
    balanceOfLPOfUser(address) returns(uint256) envfree

    // burnableERC20
    burnFrom(address,int256) => DISPATCHER(true)
    mint(address,uint256) => DISPATCHER(true)
    initialize(string,string) => DISPATCHER(true)
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

// assume sum of all underlying balances initially equals 0
ghost mathint sum_all_underlying_balances {
    init_state axiom sum_all_underlying_balances == 0;
}

// @dev A hook that keeps `sum_all_underlying_balances` up to date with the `swapStorage.balances` array
// offset of 288 bytes within struct (9 storage slots) points to the `balances` array in swapStorage
hook Sstore swapStorage.(offset 288)[INDEX uint256 i] uint256 balance (uint256 old_balance) STORAGE {
    sum_all_underlying_balances = sum_all_underlying_balances + balance - old_balance;
}


////////////////////////////////////////////////////////////////////////////
//                               Invariants                               //
////////////////////////////////////////////////////////////////////////////

/* P*
    proves on constructor that all getters are zero
    @dev * explained below
*/
invariant uninitializedImpliesZeroValueInv()
    getAllGettersRandomInput() == 0

/* (P) 
    Two underlying tokens can never have the same address
    @dev instate part of invariant is not relevant, need to prove on `initialize` 
    @dev using invariant to requireInvariant, doesn't pass
*/
invariant underlyingTokensDifferent(uint8 tokenAIndex, uint8 tokenBIndex)
    tokenAIndex != tokenBIndex => getToken(tokenAIndex) != getToken(tokenBIndex)
    {
        preserved{
            require initialized;
        }
    }

/* P
    Sum of all users' LP balance must be equal to LP's `totalSupply`
    @dev havoc on addLiq causes failures. Increasing loop_iter > 2 causes havoc on removeLiq. removeLiqOneToken also 
    has havoc but is passing, might be a similar case with loop_iter being too small
    @dev waiting on dev to fix this dispatcher bug
*/
invariant solvency()
    getTotalSupply() == sum_all_users_LP

/* 
    If balance of one underlying token is zero, the balance of all other 
    underlying tokens must also be zero
*/
invariant zeroTokenAZeroTokenB(uint8 tokenAIndex, uint8 tokenBIndex)
    getTokenBalance(tokenAIndex) == 0 => getTokenBalance(tokenBIndex) == 0

/*
    If balance of one underlying token is non-zero, the balance of all other
    underlying tokens must also be non-zero
    @dev complimentary to the invariant above 
*/
invariant nonzeroTokenAZeroTokenX(uint8 tokenA, uint8 tokenX)
    getTokenBalance(tokenA) > 0 => getTokenBalance(tokenX) > 0

/* 
    If contract is in uninitialized state, all underlying balances must be zero
*/
invariant uninitializedMeansUnderlyingsZero(uint8 token)
    !initialized => getTokenBalance(token) == 0

/*
    adminFee can never be greater MAX_ADMIN_FEE
*/
invariant adminFeeNeverGreaterThanMAX() 
    getAdminFee() <= getMaxAdminFee()

/*
    swapFee can never be greater MAX_SWAP_FEE
*/
invariant swapFeeNeverGreaterThanMAX()
    getSwapFee() <= getMaxSwapFee()

/*
    A parameter can never be zero, once initialized
*/


////////////////////////////////////////////////////////////////////////////
//                                 Rules                                  //
////////////////////////////////////////////////////////////////////////////

/* P
    cant reinit (fails due to havoc)
*/
rule cantReinit(method f) filtered {
    f -> f.selector == initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector
} {
    require initialized;
    require !initializing;
 
    env e; calldataarg args;
    f@withrevert(e,args);
 
    assert lastReverted;
}

/* P
    Only admin can set swap and admin fees
*/
rule onlyAdminCanSetSwapFees(method f) {
    uint256 swapFeeBefore = getSwapFee();

    env e; calldataarg args;
    f(e, args);

    uint256 swapFeeAfter = getSwapFee();

    assert swapFeeAfter != swapFeeBefore => f.selector == setSwapFee(uint256).selector && e.msg.sender == owner(), "fees must only be changes by admin";
}

/* P
    Only admin can set swap and admin fees
*/
rule onlyAdminCanSetAdminFees(method f) {
    uint256 swapFeeBefore = getAdminFee();

    env e; calldataarg args;
    f(e, args);

    uint256 swapFeeAfter = getAdminFee();

    assert swapFeeAfter != swapFeeBefore => f.selector == setAdminFee(uint256).selector && e.msg.sender == owner(), "fees must only be changes by admin";
}

/* P
    When paused, total LP amount can only decrease
*/
rule pausedMeansLPMonotonicallyDecreases(method f) {
    uint256 totalSupplyBefore = getTotalSupply();

    env e; calldataarg args;
    f(e, args);

    uint256 totalSupplyAfter = getTotalSupply();

    assert paused() => totalSupplyAfter <= totalSupplyBefore, "total supply of the lp token must not increase when paused";
}

/* P*
    Two underlying tokens can never have the same address (initialized)
    @dev only failing on havocing functions due to failed dispatcher
*/
rule underlyingTokensDifferentInitialized(method f) {
    uint8 tokenAIndex;
    uint8 tokenBIndex;

    require (tokenAIndex != tokenBIndex) => (getToken(tokenAIndex) != getToken(tokenBIndex));

    calldataarg args;
    env e;
    f(e,args);

    assert (tokenAIndex != tokenBIndex) => (getToken(tokenAIndex) != getToken(tokenBIndex));
}

/* P*
    Uninitialized contract state implies all variables are 0
    proves preservation (n+1 case)
    @dev * for still new getters (not tested with getTotalSupply, paused, and maybe others)
*/
rule uninitializedImpliesZeroValue(method f) { 
    uint8 i1; address i2; uint8 i3; uint8 i4; uint8 j4; uint256 k4; uint256[] i5; bool j5; uint256 i6;

    require !initialized; // do we need this?
    uint256 valBefore = getAllGettersDefinedInput(i1, i2, i3, i4, j4, k4, i5, j5, i6);
    require valBefore == 0;

    env e; calldataarg args;
    f(e,args);

    require !initialized;
    uint256 valAfter = getAllGettersDefinedInput(i1, i2, i3, i4, j4, k4, i5, j5, i6);

    assert valAfter == 0;
}

/* (P)
    Uninitialized contract state implies all state changing function calls revert
    @dev state-changing functions with 0s as input (LPing 0, swapping 0 for 0) don't revert - and shouldn't.
         All counter examples are the cases where the functions don't change state
    @dev might be unnecessary given the above rules and the fact that prover can take 0 address to be a contract which 
         we safely assume is not
    Tentatively assumed proven
*/
rule uninitializedImpliesRevert(method f) filtered {
    f -> f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector
    && !f.isView
}  {
    require !initialized;
    env e; 
    calldataarg args;
    
    f@withrevert(e,args);

    assert lastReverted;
}

/*
    There must not be a transaction that decreases only one 
    underlying balance, except for removeLiquidityOneToken 
*/
rule onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided (method f) {
    uint8 index;
    uint256 _underlyingBalance = getTokenBalance(index);
    mathint _sumBalances = sum_all_underlying_balances;

    require initialized;
    require _sumBalances >= 0;

    calldataarg args;
    env e;
    f(e,args);

    uint256 underlyingBalance_ = getTokenBalance(index);
    mathint sumBalances_ = sum_all_underlying_balances;
    //if (sumBalances_ > _sumBalances) {
    //    assert underlyingBalance_ - _underlyingBalance != sumBalances_ - _sumBalances;
    //} else if (sumBalances_ < _sumBalances) {
    if (sumBalances_ < _sumBalances) {
        assert _underlyingBalance - underlyingBalance_ != _sumBalances - sumBalances_;
    } 
    else {
        assert true;
    }
           
}

/*
    Remove liquidity doesn't remove admin fees
*/
rule removeLiquidityDoesntReduceAdminFees() {
    uint256 index;
    assert false;
}

/* 
    If totalSupply of LP token is zero, the balance of all underlying tokens must also be zero
    @dev ideally can prove as bi-implication, otherwise use two invariants (other one below)
*/
rule LPSupplyZeroMeansBalancesZero (method f) {
    //uint8 index;
    require forall uint8 index. (getTotalSupply() == 0 <=> getTokenBalance(index) == 0);
    
    //bool lh = getTokenBalance(index) == 0;
    //bool rh = getTotalSupply() == 0;
    //require forall uint8 index. lh => rh;
    
    env e; calldataarg args;
    f(e, args);

    assert forall uint8 index2. (getTotalSupply() == 0 <=> getTokenBalance(index2) == 0);
    //assert forall uint8 index. lh => rh;
}

/*
    Admin fees can only increase
*/
rule monotonicallyIncreasingFees(method f) filtered {
    f -> f.selector != withdrawAdminFees().selector && f.selector == removeLiquidity(uint256,uint256[],uint256).selector
} {
    uint256 index;

    env e;
    require e.msg.sender != currentContract;
    //requireInvariant underlyingTokensDifferent;
    requireInvariant solvency;

    uint256 balanceBefore = getAdminBalance(index);

    calldataarg args;
    f(e, args);

    uint256 balanceAfter = getAdminBalance(index);

    assert balanceAfter >= balanceBefore , "fees must not decrease, except for withdraw by admin";

}

/*
    Only admin can withdraw adminFees
*/
rule onlyAdminCanWithdrawFees() {
    method f;
    uint256 index;

    requireInvariant solvency;

    uint256 balanceBefore = getAdminBalance(index);

    env e; calldataarg args;
    f(e, args);

    uint256 balanceAfter = getAdminBalance(index);

    assert balanceAfter < balanceBefore => e.msg.sender == owner(), "fees must only be collected by admin";
}

/*
    When paused, all underlying token balances must decrease on LP withdrawal
*/ 
rule pausedImpliesNoSingleTokenWithdrawal (method f) {
    uint8 tokenAIndex; uint8 tokenBIndex;
    
    require paused();
    uint256 tokenABalanceBefore = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceBefore = getTokenBalance(tokenBIndex);

    env e; calldataarg args;
    f(e,args);

    uint256 tokenABalanceAfter = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceAfter = getTokenBalance(tokenBIndex);
    
    assert tokenABalanceAfter <= tokenABalanceBefore, "token balances must not increase when paused";
    assert tokenBBalanceAfter <= tokenBBalanceBefore, "token balances must not increase when paused";
    assert tokenABalanceAfter < tokenABalanceBefore <=> tokenBBalanceAfter < tokenBBalanceBefore, "one token must not decrease alone";
}

/*
    When paused, ratio between underlying tokens must stay constant
*/
rule pausedImpliesTokenRatioConstant(method f) {
    uint8 tokenAIndex; uint8 tokenBIndex;
    
    uint256 tokenABalanceBefore = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceBefore = getTokenBalance(tokenBIndex);
    

    mathint ratioBefore = tokenABalanceBefore / tokenBBalanceBefore;

    env e; calldataarg args;
    f(e, args);

    uint256 tokenABalanceAfter = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceAfter = getTokenBalance(tokenBIndex);

    mathint ratioAfter = tokenABalanceAfter / tokenBBalanceAfter;

    assert paused() && (tokenABalanceAfter != 0 && tokenBBalanceAfter != 0)  => ratioAfter == ratioBefore, "total supply of the lp token must not increase when paused";
}

/*
    Virtual price can never be zero, once liquidity has been deposited
*/
rule virtualPriceNeverZeroOnceLiquidityProvided() {
    uint256[] tokens;
    uint256 minToMint;
    uint256 deadline;
    
    require initialized && !initializing;

    env e;
    addLiquidity(e,tokens,minToMint,deadline);

    assert getVirtualPrice() > 0;
}

/*
    When trading token A for B, the sum A+B after the trade must always 
    be greater than adding liquidity in A and removing liquidity in B
    @dev Might be difficult to reason about with math functionsummarizations, 
    currently no plans to implement this rule
*/


/// Generalized unit tests 

/*
    Swapping A for B will always output at least minAmount of tokens B
*/
rule swappingCheckMinAmount() {
    require initialized;
    env e;
    address sender = e.msg.sender;
    uint8 tokenIndexFrom;
    uint8 tokenIndexTo;
    uint256 dx;
    uint256 minDy;
    uint256 deadline;

    uint256 _balance = balanceOfUnderlyingOfUser(sender, tokenIndexTo);
    require e.msg.sender != currentContract;

    swap(e, tokenIndexFrom, tokenIndexTo, dx, minDy, deadline);

    uint256 balance_ = balanceOfUnderlyingOfUser(sender, tokenIndexTo);
    assert balance_ >= _balance + minDy; 
}

/*
    Providing liquidity will always output at least minToMint amount of LP 
    tokens
*/
rule addLiquidityCheckMinToMint() {
    require initialized;
    env e;
    address sender = e.msg.sender;
    uint256[] amounts;
    uint256 minToMint;
    uint256 deadline;

    uint256 _balance = balanceOfLPOfUser(sender);

    addLiquidity(e, amounts, minToMint, deadline);

    uint256 balance_ = balanceOfLPOfUser(sender);
    assert balance_ >= _balance + minToMint;
}

/*
    Swap can never happen after deadline
*/
rule swapAlwaysBeforeDeadline() {
    require initialized;
    env e;
    address sender = e.msg.sender;
    uint8 tokenIndexFrom;
    uint8 tokenIndexTo;
    uint256 dx;
    uint256 minDy;
    uint256 deadline;

    swap(e, tokenIndexFrom, tokenIndexTo, dx, minDy, deadline);

    assert e.block.timestamp >= deadline;
}

/* 
    Add LP can never happen after deadline
*/
rule addLiquidityAlwaysBeforeDeadline() {
    require initialized;
    env e;
    address sender = e.msg.sender;
    uint256[] amounts;
    uint256 minToMint;
    uint256 deadline;

    addLiquidity(e, amounts, minToMint, deadline);

    assert e.block.timestamp >= deadline;
}

/*
    Remove LP can never happen after deadline
*/
rule removeLiquidityAlwaysBeforeDeadline() {
    require initialized;
    env e;
    address sender = e.msg.sender;
    uint256 amount;
    uint256[] minAmounts;
    uint256 deadline;

    removeLiquidity(e, amount, minAmounts, deadline);

    assert e.block.timestamp >= deadline;
}

/// Variable change rules (under which conditions is a variable allowed to change, and how)

/// Rules for state transitions (uninitialized, initialized, paused, inARamp, notInARamp)

/// Risk assessment rules (from stakeholder's perspectives)

/*
    TODO: Rules for A changes over time, from perspective of LPs and traders
*/


// Mathematical rules (monotonicity, commutativity etc.)


////////////////////////////////////////////////////////////////////////////
//                                Helpers                                 //
////////////////////////////////////////////////////////////////////////////


function newGetD(uint256 balance1, uint256 balance2) returns uint256 {
    uint256 invar;
    require invar >= balance1 + balance2;
    require invar <= balance1 * balance2;
    require invar == determinedInvariant[balance1][balance2];
    return invar;
}

function getAllGettersRandomInput() returns uint256 {
    uint8 i1; address i2; uint8 i3; uint8 i4; uint8 j4; uint256 k4; uint256[] i5; bool j5; uint256 i6;
    uint256 return1 = getA();
    uint256 return2 = getAPrecise();
    uint256 return3 = getToken(i1);
    uint256 return4 = getTokenIndex(i2);
    uint256 return5 = getTokenBalance(i3);
    uint256 return6 = getVirtualPrice();
    uint256 return7 = calculateSwap(i4,j4,k4);
    uint256 return8 = calculateTokenAmount(i5,j5);
    uint256 return9 = getAdminBalance(i6);
    uint256 return10 = owner();
    uint256 return11 = getTotalSupply();
    return to_uint256(return1 + return2 + return3 + return4 + return5 + return6 + return7 + return8 + return9 + return10 + return11);
}

function getAllGettersDefinedInput(uint8 i1, address i2, uint8 i3, uint8 i4, uint8 j4, uint256 k4, uint256[] i5, bool j5, uint256 i6) returns uint256 {
    uint256 return1 = getA();
    uint256 return2 = getAPrecise();
    uint256 return3 = getToken(i1);
    uint256 return4 = getTokenIndex(i2);
    uint256 return5 = getTokenBalance(i3);
    uint256 return6 = getVirtualPrice();
    uint256 return7 = calculateSwap(i4,j4,k4);
    uint256 return8 = calculateTokenAmount(i5,j5);
    uint256 return9 = getAdminBalance(i6);
    uint256 return10 = owner();
    uint256 return11 = getTotalSupply();
    return to_uint256(return1 + return2 + return3 + return4 + return5 + return6 + return7 + return8 + return9 + return10 + return11);
} 
