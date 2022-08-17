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
}

////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////


rule sanity(method f)
{
	env e;
	calldataarg args;
	f(e,args);
	assert false;
}

ghost bool initialized {
    init_state axiom initialized == false;
}

hook Sload bool init _initialized STORAGE {
    require initialized == init;
}

// fails due to havoc
rule cantReinit(method f) filtered {
    f -> f.selector == initialize(address[],uint8[],string,string,uint256,uint256,uint256,address).selector
} {
    require initialized;
 
    env e; calldataarg args;
    f@withrevert(e,args);
 
    assert lastReverted;
}

// definition isInitialized() returns bool = 
// definition initialized() returns bool =
// definition paused() returns bool = paused()
// definition inARamp returns bool = // using harness
// definition notInARamp returns bool = // using harness

////////////////////////////////////////////////////////////////////////////
//                               Invariants                               //
////////////////////////////////////////////////////////////////////////////

// Related groups of variables

//
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

/*
    When paused, total LP amount can only decrease
*/

/*
    When paused, ratio between underlying tokens must stay constant
*/

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

/* 
    Only admin can set swap and admin fees
*/




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