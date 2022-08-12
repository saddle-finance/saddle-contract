if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapHarness.sol\
    --verify SwapHarness:certora/spec/Swap.spec \
    --optimistic_loop \
    --cache saddle \
    --loop_iter 2 \
    --staging \
    --settings -enableEqualitySaturation=false \
    $RULE \
    --msg "Swap rules: $1"