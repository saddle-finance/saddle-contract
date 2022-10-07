
if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --link SwapHarness:lpToken=LPToken \
    --optimistic_loop \
    --cache saddle \
    --loop_iter 2 \
    $RULE \
    --send_only \
    --solc solc6.12 \
    --msg "Swap $1 no struct linking" \
    # --rule_sanity advanced \

    # --staging yoav/array_of_structs_fix \
    # --settings -enableEqualitySaturation=false \
    # --structLink SwapHarness:lpToken=LPToken \