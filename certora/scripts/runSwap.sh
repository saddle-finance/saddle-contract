# if [ $# -ne 1 -a $# -ne 2 ] 
# then
#     RULE="--rules $2 $3 $4 $5 $6"
# else
#     RULE="--rule $2"
# fi

if [[ "$2" ]]
then
    RULE="--rule $2"
fi

solc-select use 0.6.12

certoraRun \
    certora/harness/SwapHarness.sol \
    certora/ComplexityCheck/DummyERC20A.sol \
    certora/ComplexityCheck/DummyERC20B.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --address SwapHarness:0xce4604a0000000000000000000000062 \
    LPToken:0xce4604a0000000000000000000000050 \
    DummyERC20A:0xce4604a000000000000000000000005c \
    DummyERC20B:0xce4604a0000000000000000000000060 \
    --link SwapHarness:lpToken=LPToken \
    --link SwapHarness:token0=DummyERC20A \
    --link SwapHarness:token1=DummyERC20B \
    --cache saddle \
    --settings -mediumTimeout=300 \
    --loop_iter 2 \
    --send_only \
    --staging master \
    --optimistic_loop \
    --rule_sanity \
    $RULE \
    --msg "Swap $1 $2" \

# 4 batches of rules/invariants
# cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases
# swapAlwaysBeforeDeadline addLiquidityCheckMinToMint addLiquidityAlwaysBeforeDeadline removeLiquidityAlwaysBeforeDeadline swappingCheckMinAmount swappingIndependence tokenRatioDoesntGoBelowOne
# oneUnderlyingZeroMeansAllUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero underlyingTokensAndLPDifferent underlyingTokensDifferent swapFeeNeverGreaterThanMAX adminFeeNeverGreaterThanMAX 
# LPSolvency underlyingsSolvency LPTotalSupplyZeroWhenUninitialized lengthsAlwaysMatch ifLPTotalSupplyZeroThenIndividualUnderlyingsZero

# ,-enableEqualitySaturation=false,-simplificationDepth=10 \
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

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases underlyingTokensDifferentInitialized \
#     --msg "Swap cantReinit onlyAdminCanSetSwapFees onlyAdminCanSetAdminFees pausedMeansLPMonotonicallyDecreases underlyingTokensDifferentInitialized" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules uninitializedImpliesZeroValue onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided \
#     --msg "Swap uninitializedImpliesZeroValue onlyRemoveLiquidityOneTokenDecreasesUnderlyingsOnesided" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules monotonicallyIncreasingFees onlyAdminCanWithdrawFees pausedImpliesNoSingleTokenWithdrawal pausedImpliesTokenRatioConstant virtualPriceNeverZeroOnceLiquidityProvided \
#     --msg "Swap monotonicallyIncreasingFees onlyAdminCanWithdrawFees pausedImpliesNoSingleTokenWithdrawal pausedImpliesTokenRatioConstant virtualPriceNeverZeroOnceLiquidityProvided" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules swappingCheckMinAmount onlyAddLiquidityCanInitialize addLiquidityCheckMinToMint swapAlwaysBeforeDeadline addLiquidityAlwaysBeforeDeadline \
#     --msg "Swap swappingCheckMinAmount onlyAddLiquidityCanInitialize addLiquidityCheckMinToMint swapAlwaysBeforeDeadline addLiquidityAlwaysBeforeDeadline" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules uninitializedImpliesZeroValueInv underlyingTokensDifferent LPsolvency underlyingsSolvency zeroTokenAZeroTokenB \
#     --msg "Swap uninitializedImpliesZeroValueInv underlyingTokensDifferent LPsolvency underlyingsSolvency zeroTokenAZeroTokenB" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules uninitializedMeansUnderlyingsZero adminFeeNeverGreaterThanMAX swapFeeNeverGreaterThanMAX ifLPTotalSupplyZeroThenIndividualUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero \
#     --msg "Swap uninitializedMeansUnderlyingsZero adminFeeNeverGreaterThanMAX swapFeeNeverGreaterThanMAX ifLPTotalSupplyZeroThenIndividualUnderlyingsZero ifSumUnderlyingsZeroLPTotalSupplyZero" \

# certoraRun \
#     certora/harness/SwapHarness.sol \
#     certora/munged/LPToken.sol \
#     --verify SwapHarness:certora/spec/Swap.spec \
#     --structLink SwapHarness:lpToken=LPToken \
#     --cache saddle \
#     --loop_iter 2 \
#     --send_only \
#     --staging release/19Sep2022 \
#     --optimistic_loop \
#     --rule_sanity \
#     --rules removeLiquidityAlwaysBeforeDeadline LPtotalSupplyZeroWhenUninitialized \
#     --msg "Swap removeLiquidityAlwaysBeforeDeadline LPtotalSupplyZeroWhenUninitialized" \


