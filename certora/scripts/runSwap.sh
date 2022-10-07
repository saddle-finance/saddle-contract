
if [[ "$1" ]]
then
    RULE="--rule $1"
fi
certoraRun \
    certora/harness/SwapHarness.sol \
    certora/helpers/DummyERC20Impl.sol \
    certora/helpers/DummyERC20A.sol \
    certora/helpers/DummyERC20B.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/Swap.spec \
    --optimistic_loop \
    --cache saddle \
    --loop_iter 2 \
    --staging \
    --settings -enableEqualitySaturation=false \
    $RULE \
    --send_only \
    --msg "$1" \
    --solc solc6.12 \
    # --rule_sanity advanced \