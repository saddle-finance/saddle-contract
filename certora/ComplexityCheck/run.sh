certoraRun  contracts/Swap.sol:SwapX certora/DummyERC20A.sol certora/DummyERC20B.sol \
     --verify SwapX:certora/complexity.spec \
     --solc_map SwapX=solc6.12,DummyERC20A=solc8.0,DummyERC20B=solc8.0 \
     --staging \
     --optimistic_loop --send_only \
     --msg "Swap complexity check"

#certoraRun  contracts/meta/MetaSwap.sol certora/DummyERC20A.sol certora/DummyERC20B.sol \
#     --verify MetaSwap:certora/complexity.spec \
#     --solc_map MetaSwap=solc6.12,DummyERC20A=solc8.0,DummyERC20B=solc8.0 \
#     --staging \
#     --optimistic_loop \
#     --msg "MetaSwap complexity check"
