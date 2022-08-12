certoraRun \
    certora/munged/Swap.sol certora/helpers/DummyERC20A.sol certora/helpers/DummyERC20B.sol\
    --verify Swap:certora/ComplexityCheck/complexity.spec \
    --optimistic_loop \
    --loop_iter 2 \
    --staging \
    --settings -enableEqualitySaturation=false \
    --send_only \
    --msg "Swap loop 2 eql-sat=F: $1"

    # --settings -enableEqualitySaturation=false,-s=z3 \