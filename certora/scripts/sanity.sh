certoraRun \
    certora/harness/SwapHarness.sol \
    certora/helpers/DummyERC20A.sol \
    certora/helpers/DummyERC20B.sol \
    certora/munged/LPToken.sol \
    --verify SwapHarness:certora/spec/sanity.spec \
    --staging \
    --optimistic_loop \
    --loop_iter 2 \
    --send_only \
    --msg "Swap sanity"