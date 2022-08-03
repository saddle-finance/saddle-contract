if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapHarness.sol\
    --verify SwapHarness:certora/spec/Swap.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --send_only \
    $RULE \
    --msg "Swap with simplifications and loop 3: $1"