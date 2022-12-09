certoraRun \
    certora/munged/Swap.sol certora/helpers/DummyERC20A.sol certora/helpers/DummyERC20B.sol\
    --verify Swap:certora/ComplexityCheck/complexity.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --rule sanity \
    --staging release/19Sep2022 \
    --send_only \
    --msg "Swap $1"

    # --settings -enableEqualitySaturation=false,-s=z3 \