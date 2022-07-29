////////////////////////////////////////////////////////////////////////////
//                                Methods                                 //
////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////
//                       Ghosts and definitions                           //
////////////////////////////////////////////////////////////////////////////

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

/*
    If balance of one underlying token is non-zero, the balance of all other
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