certoraRun \
    certora/harness/PoolRegistryHarness.sol certora/helpers/DummyERC20A.sol certora/helpers/DummyERC20B.sol\
    --verify PoolRegistryHarness:certora/spec/PoolRegistry.spec \
    --staging \
    --optimistic_loop \
    --loop_iter 8 \
    --send_only \
    --rule $1 \
    --msg "Pool Registry $1"