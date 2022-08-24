import "../helpers/erc20.spec"

////////////////////////////////////////////////////////////////////////////
//                                Methods                                 //
////////////////////////////////////////////////////////////////////////////

methods {
    // math functions summarized
	getD(uint256[], uint256) returns (uint256) => NONDET
    //https://vaas-stg.certora.com/output/93493/d44d3ec77b888ed8ffa8/?anonymousKey=68714450e71c07066b886229e03adac1b7248380

	//getYD(uint256,uint8,uint256[],uint256) returns (uint256) => NONDET
	//https://vaas-stg.certora.com/output/93493/0ee9d368205356ba46de/?anonymousKey=4c7b157b05ada7e851be8ddbfc1c79734d5118f9
    
    //calculateWithdrawOneTokenDY((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint8,uint256,uint256) returns (uint256, uint256, uint256) => NONDET 
	//https://vaas-stg.certora.com/output/93493/f5150de1aa6f21a5d925/?anonymousKey=1a20045ac31f4055094b99665166d68595eede13
    
    //calculateWithdrawOneToken((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint256,uint8)  returns (uint256) => NONDET 
	//https://vaas-stg.certora.com/output/93493/c9b1695bd9c7f599870d/?anonymousKey=c42e648eafc6ff69a6a3a27ccd316126b71f28d0
    
    //_calculateWithdrawOneToken((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint256,uint8,uint256) returns (uint256, uint256) => NONDET 
	//https://vaas-stg.certora.com/output/93493/17a060161d640cf5e601/?anonymousKey=114604350bce47447e6828600f62d59d63272dac
    
    //xp(uint256[],uint256[]) returns (uint256[] ) => NONDET 
	//https://vaas-stg.certora.com/output/93493/6624b161d1d32b7d079f/?anonymousKey=18f98080154eb13810ca7394ebd2d7aed9441243

    //getVirtualPrice((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[])) returns (uint256) => CONSTANT 
	//https://vaas-stg.certora.com/output/93493/7cb06ce3e5996e22bdf8/?anonymousKey=3ce8111b07df862f13a5ead40608bb2219e46523

    //getY(uint256,uint8,uint8,uint256,uint256[]) returns (uint256) => NONDET
	//https://vaas-stg.certora.com/output/93493/5000d82bee67f635569f/?anonymousKey=d5a1a618bf7cadd3bd4d7bb128c12787b22bb3ba

    //_calculateSwap((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint8,uint8,uint256,uint256[] ) returns (uint256, uint256) => NONDET
	//https://vaas-stg.certora.com/output/93493/5ed04d8652bb7541d995/?anonymousKey=345819d34703489fe1ac73fc6046e7ef8d4910db

    //_feePerToken(uint256, uint256) returns (uint256) => NONDET
    //https://vaas-stg.certora.com/output/93493/fce4dd9375bc51e7d274/?anonymousKey=d1d19d0376018d6cd255a3d0b81853e4c9d1fbe6

    //// refactored functions
    //_addLiquidityHelper1((uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/a52c5cddea56000b3425/?anonymousKey=82df28494e920dd145c2164e630fb44f693947b9
    
    //_addLiquidityHelper2((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/4b56f3fe4454fcb081b7/?anonymousKey=97d9e5be959e5f453047964dbfd4056561b51e1c

    //_removeLiquidityImbalanceHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),uint256[]) returns (uint256[]) => NONDET
    //https://vaas-stg.certora.com/output/93493/02ffc66a1a1b6d58d17c/?anonymousKey=273372d8db6c060b54d76a192aa5233648d00c28
    
    //_removeLiquidityOneTokenHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),uint256,uint256,uint8) returns(uint256) => NONDET
    //https://vaas-stg.certora.com/output/93493/36b8abd73b5fba32a927/?anonymousKey=2f52ea8a6289c42eb2bbcee468b4b5202d06b76c

    // summariazable functions check
    // https://prover.certora.com/output/93493/9456d9506f97c875cba5/Results.txt?anonymousKey=d95f3e811114cd664bc8f9b20cc8c33ebf94b771

    // normal functions
    getTokenBalance(uint8) returns(uint256) envfree
    owner() returns(address) envfree
    getAdminBalance(uint256) returns(uint256) envfree
    paused() returns(bool) envfree

    // harness functions
    getSwapFee() returns(uint256) envfree
    getAdminFee() returns(uint256) envfree
    getPaused() returns(bool) envfree
    getTotalSupply() returns(uint256) envfree

    // burnableERC20
    burnFrom(address,uint256) => DISPATCHER(true)
    mint(address,uint256) => DISPATCHER(true)
    initialize(string,string) => DISPATCHER(true)
}

////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////


/*
    Getting initialized variable
*/
ghost bool initialized {
    init_state axiom initialized == false;
}

hook Sload bool init _initialized STORAGE {
    require initialized == init;
}

// definition isInitialized() returns bool = 
// definition initialized() returns bool =
// definition paused() returns bool = paused()
// definition inARamp returns bool = // using harness
// definition notInARamp returns bool = // using harness

/*
// assume sum of all balances initially equals 0
ghost sum_all_users_BPT() returns uint256 {
    init_state axiom sum_all_users_BPT() == 0;
}

// everytime `balances` is called, update `sum_all_users_BPT` by adding the new value and subtracting the old value
hook Sstore _balances[KEY address user] uint256 balance (uint256 old_balance) STORAGE {
  havoc sum_all_users_BPT assuming sum_all_users_BPT@new() == sum_all_users_BPT@old() + balance - old_balance;
}
*/

////////////////////////////////////////////////////////////////////////////
//                               Invariants                               //
////////////////////////////////////////////////////////////////////////////

rule sanity(method f) {
	env e;
	calldataarg args;
	f(e,args);
	assert false;
}

/*
    cant reinit (fails due to havoc)
*/
rule cantReinit(method f) filtered {
    f -> f.selector == initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector
} {
    require initialized;
 
    env e; calldataarg args;
    f@withrevert(e,args);
 
    assert lastReverted;
}

/*
    Sum of all users' BPT balance must be less than or equal to BPT's `totalSupply`
*/
//invariant solvency()
//    totalSupply() >= sum_all_users_BPT()

/* 
    If balance of one underlying token is zero, the balance of all other 
    underlying tokens must also be zero
*/
invariant zeroTokenAZeroTokenX(uint8 tokenA, uint8 tokenX)
    getTokenBalance(tokenA) == 0 => getTokenBalance(tokenX) == 0

/*
    If balance of one underlying token is non-zero, the balance of all other
    underlying tokens must also be non-zero
*/
invariant nonzeroTokenAZeroTokenX(uint8 tokenA, uint8 tokenX)
    getTokenBalance(tokenA) > 0 => getTokenBalance(tokenX) > 0

/* 
    If totalSupply of LP token is zero, the balance of all other 
    underlying tokens must also be zero
*/

/* 
    If totalSupply of LP token is non-zero, the balance of all other 
    underlying tokens must also be non-zero
*/

/*
    There must not be a transaction that increases or decreases only one 
    underlying balance, except for withdrawWithOneToken (or something like
    that)
*/

/* 
    There must not be a transaction, after which one underlying balance is 
    zero and the balance of others is non-zero (implied by invariant above)
*/

/*
    A parameter can never be zero, once initialized
*/

/*
    Virtual price can never be zero, once liquidity has been deposited
*/

/* 
    If contract is in uninitialized state, no underlying balance can 
    change
*/

/*
    swapFee can never be greater MAX_SWAP_FEE
*/

/*
    adminFee can never be greater MAX_ADMIN_FEE
*/

/*
    Swap can never happen after deadline
*/

/* 
    Add LP can never happen after deadline
*/

/*
    Remove LP can never happen after deadline
*/

/*
    Total LP amount * virtual price must be within x% of sum of underlying tokens
*/

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

/*
    When paused, ratio between underlying tokens must stay constant
*/
rule pausedMeansTokenRatioConstant(method f) {
    uint8 tokenAIndex; uint8 tokenBIndex;
    
    uint256 tokenABalanceBefore = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceBefore = getTokenBalance(tokenBIndex);

    mathint ratioBefore = tokenABalanceBefore / tokenBBalanceBefore;

    env e; calldataarg args;
    f(e, args);

    uint256 tokenABalanceAfter = getTokenBalance(tokenAIndex);
    uint256 tokenBBalanceAfter = getTokenBalance(tokenBIndex);

    mathint ratioAfter = tokenABalanceAfter / tokenBBalanceAfter;

    assert paused() => ratioAfter == ratioBefore, "total supply of the lp token must not increase when paused";
}

/*
    When trading token A for B, the sum A+B after the trade must always 
    be greater than adding liquidity in A and removing liquidity in B
    NOTE: might fail in edge cases. find exact conditions where it fails
*/

/*
    Swapping A for B will always output at least minAmount of tokens B
*/

/*
    Providing liquidity will always output at least minToMint amount of LP 
    tokens
*/

/*
    Only admin can withdraw adminFees
*/
rule onlyAdminCanWithdrawFees() {
    method f;
    uint256 index;

    uint256 balanceBefore = getAdminBalance(index);

    env e; calldataarg args;
    f(e, args);

    uint256 balanceAfter = getAdminBalance(index);

    assert balanceAfter < balanceBefore => e.msg.sender == owner(), "fees must only be collected by admin";
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

////////////////////////////////////////////////////////////////////////////
//                                 Rules                                  //
////////////////////////////////////////////////////////////////////////////

/// Generalized unit tests 

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