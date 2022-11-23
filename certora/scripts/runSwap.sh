if [ $# -ne 1 -a $# -ne 2 ] 
then
    RULE="--rules $2 $3 $4 $5 $6"
else
    RULE="--rule $2"
fi

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --settings -copyLoopUnroll=10,-t=2000,-mediumTimeout=200,-depth=100 \
    $RULE \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --msg "Swap $1 $2 $3 $4 $5 $6"
    # --staging yoav/array_of_structs_fix \
    # --settings -enableEqualitySaturation=false \

#--rules cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases underlyingTokensDifferentInitialized

#--rules uninitializedImpliesZeroValue uninitializedImpliesRevert onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided removeLiquidityDoesntReduceAdminFees LPSupplyZeroMeansBalancesZero

#--rules monotonicallyIncreasingFees onlyAdminCanWithdrawFees pausedImpliesNoSingleTokenWithdrawal pausedImpliesTokenRatioConstant virtualPriceNeverZeroOnceLiquidityProvided

#--rules swappingCheckMinAmount onlyAddLiquidityCanInitialize addLiquidityCheckMinToMint swapAlwaysBeforeDeadline addLiquidityAlwaysBeforeDeadline

#--rules uninitializedImpliesZeroValueInv underlyingTokensDifferent LPsolvency underlyingsSolvency zeroTokenAZeroTokenB

#--rules uninitializedMeansUnderlyingsZero adminFeeNeverGreaterThanMAX swapFeeNeverGreaterThanMAX ifLPTotalSupplyZeroThenIndividualUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero

#--rules removeLiquidityAlwaysBeforeDeadline LPtotalSupplyZeroWhenUninitialized

