import "../helpers/erc20.spec"
using LPToken as lpToken

////////////////////////////////////////////////////////////////////////////
//                                Methods                                 //
////////////////////////////////////////////////////////////////////////////

methods {

    // math functions summarized
	getD(uint256[], uint256) returns (uint256) => NONDET
    getY(uint256,uint8,uint8,uint256,uint256[]) returns (uint256) => NONDET
    getYD(uint256,uint8,uint256[],uint256) returns (uint256) => NONDET
    // scaling functions summarized
    //_xp(uint256[],uint256[]) returns (uint256[]) => NONDET
    // newly declared function to help with summarization
    getDApprox(uint256 xp1, uint256 xp2) returns(uint256) => newGetD(xp1,xp2);

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
    removeLiquidityOneToken(uint256,uint8,uint256,uint256) 
    removeLiquidityImbalance(uint256[],uint256,uint256)

    // harness functions
    lengthsMatch() returns(bool) envfree
    getSwapFee() returns(uint256) envfree
    getAdminFee() returns(uint256) envfree
    getTotalSupply() returns(uint256) envfree
    getMaxAdminFee() returns(uint256) envfree
    getMaxSwapFee() returns(uint256) envfree
    balanceOfUnderlyingOfUser(address,uint8) returns(uint256) envfree
    balanceOfLPOfUser(address) returns(uint256) envfree
    getSumOfUnderlyings() returns(uint256) envfree
    getLPTokenAddress() returns(address) envfree
    getMultiplier(uint256) returns(uint256) envfree

    // external calls to burnableERC20
    burnFrom(address,uint256) => DISPATCHER(true)
    mint(address,uint256) => DISPATCHER(true)
    initialize(string,string) => DISPATCHER(true)
}


////////////////////////////////////////////////////////////////////////////
//                                Helpers                                 //
////////////////////////////////////////////////////////////////////////////


function newGetD(uint256 balance1, uint256 balance2) returns uint256 {
    uint256 invar; havoc invar;
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
    uint256 return7 = 0;//calculateSwap(i4,j4,k4);
    uint256 return8 = 0;//calculateTokenAmount(i5,j5);
    uint256 return9 = getAdminBalance(i6);
    uint256 return10 = owner();
    uint256 return11 = getTotalSupply();
    return to_uint256(return1 + return2 + return3 + return4 + return5 + return6 + return7 + return8 + return9 + return10 + return11);
} 

function requireInitialized() {
    require !initializing;
    require initialized;
}

function assumeNormalDecimals(uint256 i) {
    require getMultiplier(i) == 1 // WETH, decimals == 18
        || getMultiplier(i) == 10^10 // aTokens/cToken/wBTC, decimals == 8
        || getMultiplier(i) == 10^12; // USDC, decimals == 6
}

function basicAssumptions(env e) {
    requireInitialized();
    assumeNormalDecimals(0);
    assumeNormalDecimals(1);
    requireInvariant oneUnderlyingZeroMeansAllUnderlyingsZero(0);
    requireInvariant oneUnderlyingZeroMeansAllUnderlyingsZero(1);
    requireInvariant LPSolvency();
    require lpToken.balanceOf(e, e.msg.sender) <= getTotalSupply();
    requireInvariant underlyingsSolvency();
    requireInvariant underlyingTokensAndLPDifferent();
    requireInvariant underlyingTokensDifferent(0,1);
    requireInvariant lengthsAlwaysMatch(); 
    requireInvariant adminFeeNeverGreaterThanMAX();
    requireInvariant swapFeeNeverGreaterThanMAX();
    require e.msg.sender != currentContract;
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
hook Sstore currentContract.swapStorage.balances[INDEX uint256 i] uint256 balance (uint256 old_balance) STORAGE {
    sum_all_underlying_balances = sum_all_underlying_balances + balance - old_balance;
}


////////////////////////////////////////////////////////////////////////////
//                               Invariants                               //
////////////////////////////////////////////////////////////////////////////

/**
 * If balance of one underlying token is zero, the balance of all other underlying tokens must also be zero
 * @dev ran with -mediumTimeout=300 and getD summarized
 */
invariant oneUnderlyingZeroMeansAllUnderlyingsZero(uint8 i)
    getTokenBalance(i) == 0 => sum_all_underlying_balances == 0
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved swap(uint8 i1, uint8 i2, uint256 i3, uint256 i4, uint256 i5) with (env e) {
            basicAssumptions(e);
            require i1 != i2;
        }
        preserved removeLiquidityOneToken(uint256 i1, uint8 i2, uint256 i3, uint256 i4) with (env e) {
            basicAssumptions(e);
            require getAdminFee() < getMaxAdminFee();
        }
        preserved with (env e) {
            basicAssumptions(e);
        }
    }

/**
 * The LP Token's totalSupply must be 0 if the sum of all underlying tokens is 0
 */
invariant ifSumUnderlyingsZeroLPTotalSupplyZero()
    sum_all_underlying_balances == 0 => getTotalSupply() == 0
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved with (env e){
            basicAssumptions(e);
        }
    }

/**
 * If total supply of LP token is zero then every underlying token balance is also zero
 */
invariant ifLPTotalSupplyZeroThenIndividualUnderlyingsZero(uint8 i)
    getTotalSupply() == 0 => getTokenBalance(i) == 0
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved with (env e) {
            basicAssumptions(e);
        }
    }

/**
 * Underlying tokens are different from the LP token 
 */
invariant underlyingTokensAndLPDifferent()
    getLPTokenAddress() != getToken(0) && getLPTokenAddress() != getToken(1)
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    { 
        preserved {
            requireInitialized();
        } 
    }

/** 
 * Underlying tokens remain different
 */
invariant underlyingTokensDifferent(uint8 i, uint8 j)
    i != j => getToken(i) != getToken(j)
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved{
            requireInitialized();
        }
    }

/**
 * swapFee can never be greater MAX_SWAP_FEE
 */
invariant swapFeeNeverGreaterThanMAX()
    getSwapFee() <= getMaxSwapFee()
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }

/**
 * adminFee can never be greater MAX_ADMIN_FEE
 */
invariant adminFeeNeverGreaterThanMAX() 
    getAdminFee() <= getMaxAdminFee()

/**
 * Sum of all users' LP balance must be equal to LP's `totalSupply`
 */
invariant LPSolvency()
    getTotalSupply() == sum_all_users_LP
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved {
                requireInitialized();
            }
    }

/**
 * Sum of all underlying balances must equal the contract's sum.
 */
invariant underlyingsSolvency()
    getSumOfUnderlyings() == sum_all_underlying_balances
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved {
                requireInitialized();
            }
    }

/**
 * LPToken totalSupply must be zero if `addLiquidity` has not been called
 */
invariant LPTotalSupplyZeroWhenUninitialized()
    getTotalSupply() == 0
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    { 
        preserved addLiquidity(uint256[] amounts,uint256 minToMint,uint256 deadline) with (env e1) {
            require false;
        }
        preserved {
            requireInitialized();
        }
    }


/**
 * The length of the pooledTokens array must match the length of the balances array
 */
invariant lengthsAlwaysMatch()
    lengthsMatch()
    filtered {f -> f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
        && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
    }
    {
        preserved {
            requireInitialized();
        }
    }

////////////////////////////////////////////////////////////////////////////
//                                 Rules                                  //
////////////////////////////////////////////////////////////////////////////

/**
 * Contract can't be initialized again if it has already been initialized.
 */
rule cantReinit(method f) filtered {
    f -> f.selector == initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector
} {
    requireInitialized();
 
    env e; calldataarg args;
    f@withrevert(e,args);
 
    assert lastReverted;
}

/**
 * Only admin can set swap fees.
 */
rule onlyAdminCanSetSwapFees(method f) filtered {f -> 
    f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
    && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
} {
    requireInitialized();
    uint256 swapFeeBefore = getSwapFee();

    env e; calldataarg args;
    f(e, args);

    uint256 swapFeeAfter = getSwapFee();

    assert swapFeeAfter != swapFeeBefore => f.selector == setSwapFee(uint256).selector && e.msg.sender == owner(), "fees must only be changes by admin";
}

/**
 * Only admin can set admin fees.
 */
rule onlyAdminCanSetAdminFees(method f) filtered {f -> 
    f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
    && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
} {
    requireInitialized();
    uint256 swapFeeBefore = getAdminFee();

    env e; calldataarg args;
    f(e, args);

    uint256 swapFeeAfter = getAdminFee();

    assert swapFeeAfter != swapFeeBefore => f.selector == setAdminFee(uint256).selector && e.msg.sender == owner(), "fees must only be changes by admin";
}

/**
 * When paused, total LP amount can only decrease.
 */
rule pausedMeansLPMonotonicallyDecreases(method f) filtered {f -> 
    f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
    && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
} {
    uint256 totalSupplyBefore = getTotalSupply();

    env e; calldataarg args;
    f(e, args);

    uint256 totalSupplyAfter = getTotalSupply();

    assert paused() => totalSupplyAfter <= totalSupplyBefore, "total supply of the lp token must not increase when paused";
}

/**
 * Swap can never happen after deadline.
 */
rule swapAlwaysBeforeDeadline() {
    requireInitialized();
    env e;

    uint8 tokenIndexFrom;
    uint8 tokenIndexTo;
    uint256 dx;
    uint256 minDy;
    uint256 deadline;

    swap(e, tokenIndexFrom, tokenIndexTo, dx, minDy, deadline);

    assert e.block.timestamp <= deadline;
}

/**
 * Providing liquidity will always output at least `minToMint` amount of LP tokens.
 */
rule addLiquidityCheckMinToMint() {
    requireInitialized();
    requireInvariant underlyingTokensAndLPDifferent();
    env e;
    address sender = e.msg.sender;
    uint256[] amounts;
    uint256 minToMint;
    uint256 deadline;

    uint256 balanceBefore = balanceOfLPOfUser(sender);

    addLiquidity(e, amounts, minToMint, deadline);

    uint256 balanceAfter = balanceOfLPOfUser(sender);
    assert balanceAfter >= balanceBefore + minToMint;
}

/**
 * Add LP can never happen after deadline.
 */
rule addLiquidityAlwaysBeforeDeadline() {
    requireInitialized();
    env e;
    address sender = e.msg.sender;
    uint256[] amounts;
    uint256 minToMint;
    uint256 deadline;

    addLiquidity(e, amounts, minToMint, deadline);

    assert e.block.timestamp <= deadline;
}

/**
 * Remove LP can never happen after deadline.
 */
rule removeLiquidityAlwaysBeforeDeadline() {
    requireInitialized();
    env e;
    address sender = e.msg.sender;
    uint256 amount;
    uint256[] minAmounts;
    uint256 deadline;

    removeLiquidity(e, amount, minAmounts, deadline);

    assert e.block.timestamp <= deadline;
}

/**
 * Swapping A for B will always output at least minAmount of tokens B.
 */
rule swappingCheckMinAmount() {
    requireInitialized();
    env e;
    address sender = e.msg.sender;
    uint8 tokenIndexFrom;
    uint8 tokenIndexTo;
    uint256 dx;
    uint256 minDy;
    uint256 deadline;

    uint256 _balance = balanceOfUnderlyingOfUser(sender, tokenIndexTo);
    basicAssumptions(e);
    require tokenIndexTo != tokenIndexFrom;

    swap(e, tokenIndexFrom, tokenIndexTo, dx, minDy, deadline);

    uint256 balance_ = balanceOfUnderlyingOfUser(sender, tokenIndexTo);
    assert balance_ >= _balance + minDy; 
}

/**
 * Swapping token A for token B doesn't change underlying balance of token C.
 */
rule swappingIndependence() {
    requireInitialized();
    env e;
    address sender = e.msg.sender;
    uint8 tokenIndexFrom;
    uint8 tokenIndexTo;
    uint8 tokenIndex3;
    uint256 dx;
    uint256 minDy;
    uint256 deadline;

    uint256 _balance = balanceOfUnderlyingOfUser(sender, tokenIndex3);
    require e.msg.sender != currentContract;
    require tokenIndexTo != tokenIndexFrom;
    require tokenIndexTo != tokenIndex3;
    require tokenIndexFrom != tokenIndex3;
    requireInvariant underlyingTokensDifferent(tokenIndexFrom, tokenIndexTo);
    requireInvariant underlyingTokensDifferent(tokenIndexFrom, tokenIndex3);
    requireInvariant underlyingTokensDifferent(tokenIndex3, tokenIndexTo);

    swap(e, tokenIndexFrom, tokenIndexTo, dx, minDy, deadline);

    uint256 balance_ = balanceOfUnderlyingOfUser(sender, tokenIndex3);
    assert balance_ == _balance; 
}

/**
 * Ratio between underlying tokens must stay above one when measured as tokenA/tokenB where tokenAbalance >= tokenBbalance initally.
 */
rule tokenRatioDoesntGoBelowOne(method f) filtered {f -> 
    f.selector != removeLiquidityImbalance(uint256[],uint256,uint256).selector
    && f.selector != initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector 
} {
    uint8 i; uint8 j;
    
    env e; calldataarg args;
    basicAssumptions(e);
    require i != j;

    uint256 tokenABalanceBefore = getTokenBalance(i);
    uint256 tokenBBalanceBefore = getTokenBalance(j);
    require tokenABalanceBefore >= tokenBBalanceBefore;
    require tokenABalanceBefore > 0;
    require tokenBBalanceBefore > 0;
    mathint ratioBefore = tokenABalanceBefore / tokenABalanceBefore;
    
    f(e, args);

    uint256 tokenABalanceAfter = getTokenBalance(i);
    uint256 tokenBBalanceAfter = getTokenBalance(j);
    require tokenABalanceAfter >= tokenBBalanceAfter;
    require tokenABalanceAfter > 0;
    require tokenBBalanceAfter > 0;
    mathint ratioAfter = tokenABalanceAfter / tokenBBalanceAfter;


    assert ratioBefore >= 1 <=> ratioAfter >= 1, "ratio of tokens must not go below 1 when paused";
}


// /// Good bye



// /* 2 2
//     If contract is in uninitialized state, all underlying balances must be zero
// */
// invariant uninitializedMeansUnderlyingsZero(uint8 index)
//     !initialized => getTokenBalance(index) == 0

// /* 2 3
//     Virtual price can never be zero, once liquidity has been deposited
// */
// rule virtualPriceNeverZeroOnceLiquidityProvided() {
//     uint256[] tokens;
//     uint256 minToMint;
//     uint256 deadline;
    
//     requireInitialized();
//     require tokens.length == 2;
//     // require tokens[0] > 0 && tokens[1] > 0;

//     env e;
//     addLiquidity(e,tokens,minToMint,deadline);

//     assert getVirtualPrice() > 0;
// }



/* 2 3
    When trading token A for B, the sum A+B after the trade must always 
    be greater than adding liquidity in A and removing liquidity in B
    @dev Might be difficult to reason about with math functionsummarizations, 
    currently no plans to implement this rule
*/


/* 2.5 3
    No function except removeLiquidityImbalance decreases the virtual price
*/
/*rule onlyRemoveLiquidityImbalanceDecreasesVirtualPrice(method f) {
    requireInitialized();
    
    
    env e; calldataarg args;
    f(e,args);

    assert false;
}*/

/* 1.5 2 (might be replacable by 2 1 monotonicity rule)- replaceable by no free minting and no unpaid burning + LP total supply only decreases when paused monotonicity rule 
    When paused, all underlying token balances must decrease on LP withdrawal
*/ 
// rule pausedImpliesNoSingleTokenWithdrawal(method f) {
//     uint8 i; uint8 j;
    
//     requireInitialized();
//     require getTokenBalance(i) == 0 <=> getTokenBalance(j) == 0;
//     require paused();
//     uint256 tokenABalanceBefore = getTokenBalance(i);
//     uint256 tokenBBalanceBefore = getTokenBalance(j);

//     env e; calldataarg args;
//     f(e,args);

//     uint256 tokenABalanceAfter = getTokenBalance(i);
//     uint256 tokenBBalanceAfter = getTokenBalance(j);
    
//     assert tokenABalanceAfter <= tokenABalanceBefore, "token balances must not increase when paused";
//     assert tokenBBalanceAfter <= tokenBBalanceBefore, "token balances must not increase when paused";
//     assert tokenABalanceAfter < tokenABalanceBefore <=> tokenBBalanceAfter < tokenBBalanceBefore, "one token must not decrease alone";
// }

// /* 1 2
//     Uninitialized contract state implies all variables are 0
//     proves preservation (n+1 case)
//     @dev * for still new getters (not tested with getTotalSupply, paused, and maybe others)
//     @dev fails due to Java exception. Not sure why
// */
// rule uninitializedImpliesZeroValue(method f) { 
//     uint8 i1; address i2; uint8 i3; uint8 i4; uint8 j4; uint256 k4; uint256[] i5; bool j5; uint256 i6;

//     require !initialized;
//     uint256 valBefore = getAllGettersDefinedInput(i1, i2, i3, i4, j4, k4, i5, j5, i6);
//     require valBefore == 0;

//     env e; calldataarg args;
//     f(e,args);

//     require !initialized;
//     uint256 valAfter = getAllGettersDefinedInput(i1, i2, i3, i4, j4, k4, i5, j5, i6);

//     assert valAfter == 0;
// }

// /* 1 2
//     There must not be a transaction that decreases only one 
//     underlying balance, except for removeLiquidityOneToken 
// */
// rule onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided (method f) {
//     uint8 index;
//     uint256 _underlyingBalance = getTokenBalance(index);
//     mathint _sumBalances = sum_all_underlying_balances;

//     env e;
//     basicAssumptions(e);
//     require _sumBalances >= 0;

//     calldataarg args;

//     f(e,args);

//     uint256 underlyingBalance_ = getTokenBalance(index);
//     mathint sumBalances_ = sum_all_underlying_balances;

//     assert (sumBalances_ < _sumBalances) => _underlyingBalance - underlyingBalance_ != _sumBalances - sumBalances_;     
// }

// /* 1 2
//     Admin fees can only increase
// */
// rule monotonicallyIncreasingFees(method f) filtered {
//     f -> f.selector != withdrawAdminFees().selector
// } {
//     uint8 indexA;
//     uint8 indexB;

//     env e;
//     basicAssumptions(e);

//     uint256 balanceBefore = getAdminBalance(indexA);

//     calldataarg args;
//     f(e, args);

//     uint256 balanceAfter = getAdminBalance(indexA);

//     assert balanceAfter >= balanceBefore , "fees must not decrease, except for withdraw by admin";
// }

// /* 1 1
//     Only admin can withdraw adminFees
// */
// rule onlyAdminCanWithdrawFees() {
//     method f;
//     uint8 index;

//     env e;
//     basicAssumptions(e);

//     uint256 balanceBefore = getAdminBalance(index);

//     calldataarg args;
//     f(e, args);

//     uint256 balanceAfter = getAdminBalance(index);

//     assert balanceAfter < balanceBefore => e.msg.sender == owner(), "fees must only be collected by admin";
// }

// /* 
//     Adding liquidity to one should decrease that tokens price
// */

// /*
//     Token addresses can't change
// */

// /* 
//     Slippage less than constant product pool
// */

// /* 
//     Slippage proportional to change in balances
// */

// /*
//     Swaping token A for token B followed by B for A should not result in a decrease in balances of the pool 
// */

// /*
//     Swaping token A for token B followed by B for A should not result in a decrease in the product of balances  
// */

// /*
//     Swaping token A for token B followed by B for A should not result in a decrease in the virtual price
// */

// /*
//     All functionality of removeLiquidityImbalance can be performed using 2 removeLiquidityOneToken calls for a pool with 2 tokens
// */