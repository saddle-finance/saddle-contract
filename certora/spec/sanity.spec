
rule sanity(method f)
filtered { f -> f.selector == addPool((address,uint8,bytes32,address,address,bool,bool,bool)).selector}
{
	env e;
	calldataarg args;
	f(e,args);
	assert false;
}
