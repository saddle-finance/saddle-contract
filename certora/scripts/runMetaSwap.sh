
if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/MetaSwapHarness.sol \
    certora/ComplexityCheck/DummyERC20A.sol \
    certora/ComplexityCheck/DummyERC20B.sol \
    certora/munged/LPToken.sol \
    --verify MetaSwapHarness:certora/spec/Swap.spec \
    --cache saddle \
    --loop_iter 2 \
    --send_only \
    --staging release/19Sep2022 \
    --optimistic_loop \
    --rule_sanity \
    $RULE \
    --msg "Swap $1" \