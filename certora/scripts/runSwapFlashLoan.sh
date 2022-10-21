
if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapFlashLoanHarness.sol \
    certora/munged/LPToken.sol \
    --verify SwapFlashLoanHarness:certora/spec/SwapFlashLoan.spec \
    --structLink SwapFlashLoanHarness:lpToken=LPToken \
    --optimistic_loop \
    --cache saddle \
    --loop_iter 3 \
    --settings -copyLoopUnroll=16 \
    $RULE \
    --send_only \
    --msg "Swap $1 $2" \
    # --staging yoav/array_of_structs_fix \
    # --settings -enableEqualitySaturation=false \
    # 