
if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --structLink SwapHarness:lpToken=LPToken \
    --optimistic_loop \
    --cache saddle \
    --loop_iter 3 \
    --settings -copyLoopUnroll=3 \
    $RULE \
    --send_only \
    --msg "Swap $1 $2" \
    --staging release/19Sep2022
    # --staging yoav/array_of_structs_fix \
    # --settings -enableEqualitySaturation=false \
    # 