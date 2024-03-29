import "erc20.spec"

methods {
	getD(uint256[], uint256) returns (uint256) => NONDET
	getYD(uint256,uint8,uint256[],uint256) returns (uint256) => NONDET
	getY(uint256,uint8,uint8,uint256,uint256[]) returns (uint256) => NONDET
	// calculateWithdrawOneTokenDY((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint8,uint256,uint256) returns (uint256, uint256, uint256) => NONDET 
	// calculateWithdrawOneToken((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint256,uint8)  returns (uint256) => NONDET 
	// _calculateWithdrawOneToken((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint256,uint8,uint256) returns (uint256, uint256) => NONDET 
	// xp(uint256[],uint256[]) returns (uint256[] ) => NONDET 
	// getVirtualPrice((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[])) returns (uint256) => CONSTANT 
	// getY(uint256,uint8,uint8,uint256,uint256[]) returns (uint256) => NONDET
	// _calculateSwap((uint256, uint256, uint256, uint256, uint256, uint256, address, address[], uint256[], uint256[]),uint8,uint8,uint256,uint256[] ) returns (uint256, uint256) => NONDET
	// _feePerToken(uint256, uint256) returns (uint256) => NONDET

    // refactored functions
    /*
    _addLiquidityHelper1((uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    _addLiquidityHelper2((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),address[],uint256[]) returns(uint256[]) => NONDET
    _removeLiquidityImbalanceHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),(uint256,uint256,uint256,uint256,address,uint256,uint256[],uint256[]),uint256[]) returns (uint256[]) => NONDET
    _removeLiquidityOneTokenHelper1((uint256,uint256,uint256,uint256,uint256,uint256,address,address[],uint256[],uint256[]),uint256,uint256,uint8) returns(uint256) => NONDET
    */
}

rule sanity(method f)
{
	env e;
	calldataarg args;
	f(e,args);
	assert false;
}


/*
This rule find which functions never reverts.

*/


rule noRevert(method f)
description "$f has reverting paths"
{
	env e;
	calldataarg arg;
	require e.msg.value == 0; 
	f@withrevert(e, arg); 
	assert !lastReverted, "${f.selector} can revert";
}


rule alwaysRevert(method f)
description "$f has reverting paths"
{
	env e;
	calldataarg arg;
	f@withrevert(e, arg); 
	assert lastReverted, "${f.selector} succeeds";
}


/*
This rule find which functions that can be called, may fail due to someone else calling a function right before.

This is n expensive rule - might fail on the demo site on big contracts
*/

rule simpleFrontRunning(method f, address privileged) filtered { f-> !f.isView }
description "$f can no longer be called after it had been called by someone else"
{
	env e1;
	calldataarg arg;
	require e1.msg.sender == privileged;  

	storage initialStorage = lastStorage;
	f(e1, arg); 
	bool firstSucceeded = !lastReverted;

	env e2;
	calldataarg arg2;
	require e2.msg.sender != e1.msg.sender;
	f(e2, arg2) at initialStorage; 
	f@withrevert(e1, arg);
	bool succeeded = !lastReverted;

	assert succeeded, "${f.selector} can be not be called if was called by someone else";
}


/*
This rule find which functions are privileged.
A function is privileged if there is only one address that can call it.

The rules finds this by finding which functions can be called by two different users.

*/


rule privilegedOperation(method f, address privileged)
description "$f can be called by more than one user without reverting"
{
	env e1;
	calldataarg arg;
	require e1.msg.sender == privileged;

	storage initialStorage = lastStorage;
	f@withrevert(e1, arg); // privileged succeeds executing candidate privileged operation.
	bool firstSucceeded = !lastReverted;

	env e2;
	calldataarg arg2;
	require e2.msg.sender != privileged;
	f@withrevert(e2, arg2) at initialStorage; // unprivileged
	bool secondSucceeded = !lastReverted;

	assert  !(firstSucceeded && secondSucceeded), "${f.selector} can be called by both ${e1.msg.sender} and ${e2.msg.sender}, so it is not privileged";
}