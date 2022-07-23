certoraRun \
    certora/harness/PoolRegistryHarness.sol certora/helpers/DummyERC20A.sol certora/helpers/DummyERC20B.sol\
    --verify PoolRegistryHarness:certora/spec/sanity.spec \
    --staging \
    --optimistic_loop \
    --loop_iter 3 \
    --send_only \
    --msg "Pool Registry sanity"