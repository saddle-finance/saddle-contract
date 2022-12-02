if [ $# -ne 1 -a $# -ne 2 ] 
then
    RULE="--rules $2 $3 $4 $5 $6"
else
    RULE="--rule $2"
fi

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --settings -copyLoopUnroll=10,-t=1000,-mediumTimeout=40,-depth=50\
#     $RULE \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --msg "Swap $1 $2 $3 $4 $5 $6"

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases underlyingTokensDifferentInitialized \
    --msg "Swap cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases underlyingTokensDifferentInitialized" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules uninitializedImpliesZeroValue uninitializedImpliesRevert onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided removeLiquidityDoesntReduceAdminFees LPSupplyZeroMeansBalancesZero \
    --msg "Swap uninitializedImpliesZeroValue uninitializedImpliesRevert onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided removeLiquidityDoesntReduceAdminFees LPSupplyZeroMeansBalancesZero" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules monotonicallyIncreasingFees onlyAdminCanWithdrawFees pausedImpliesNoSingleTokenWithdrawal pausedImpliesTokenRatioConstant virtualPriceNeverZeroOnceLiquidityProvided \
    --msg "Swap monotonicallyIncreasingFees onlyAdminCanWithdrawFees pausedImpliesNoSingleTokenWithdrawal pausedImpliesTokenRatioConstant virtualPriceNeverZeroOnceLiquidityProvided" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules swappingCheckMinAmount onlyAddLiquidityCanInitialize addLiquidityCheckMinToMint swapAlwaysBeforeDeadline addLiquidityAlwaysBeforeDeadline \
    --msg "Swap swappingCheckMinAmount onlyAddLiquidityCanInitialize addLiquidityCheckMinToMint swapAlwaysBeforeDeadline addLiquidityAlwaysBeforeDeadline" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules uninitializedImpliesZeroValueInv underlyingTokensDifferent LPsolvency underlyingsSolvency zeroTokenAZeroTokenB \
    --msg "Swap uninitializedImpliesZeroValueInv underlyingTokensDifferent LPsolvency underlyingsSolvency zeroTokenAZeroTokenB" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules uninitializedMeansUnderlyingsZero adminFeeNeverGreaterThanMAX swapFeeNeverGreaterThanMAX ifLPTotalSupplyZeroThenIndividualUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero \
    --msg "Swap uninitializedMeansUnderlyingsZero adminFeeNeverGreaterThanMAX swapFeeNeverGreaterThanMAX ifLPTotalSupplyZeroThenIndividualUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero" \

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    --rules removeLiquidityAlwaysBeforeDeadline LPtotalSupplyZeroWhenUninitialized \
    --msg "Swap removeLiquidityAlwaysBeforeDeadline LPtotalSupplyZeroWhenUninitialized" \


