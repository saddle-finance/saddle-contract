certoraRun \
    certora/munged/registries/PoolRegistry.sol certora/helpers/DummyERC20A.sol certora/helpers/DummyERC20B.sol\
    --verify PoolRegistry:certora/ComplexityCheck/complexity.spec \
    --staging \
    --optimistic_loop \
    --loop_iter 3 \
    --send_only \
    --msg "PoolRegistry complexity check"


# certoraRun  contracts/core/connext/facets/BaseConnextFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify BaseConnextFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "BaseConnextFacet complexity check"


# certoraRun  contracts/core/connext/facets/BridgeFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify BridgeFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "BridgeFacet complexity check"


# certoraRun  contracts/core/connext/facets/DiamondCutFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify DiamondCutFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "DiamondCutFacet complexity check"


# certoraRun  contracts/core/connext/facets/DiamondLoupeFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify DiamondLoupeFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "DiamondLoupeFacet complexity check"


# certoraRun  contracts/core/connext/facets/NomadFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify NomadFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "NomadFacet complexity check"


# certoraRun  contracts/core/connext/facets/PortalFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify PortalFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "PortalFacet complexity check"


# certoraRun  contracts/core/connext/facets/ProposedOwnableFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify ProposedOwnableFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "ProposedOwnableFacet complexity check"


# certoraRun  contracts/core/connext/facets/RelayerFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify RelayerFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "RelayerFacet complexity check"


# certoraRun  contracts/core/connext/facets/RoutersFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify RoutersFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "RoutersFacet complexity check"


# certoraRun  contracts/core/connext/facets/StableSwapFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify StableSwapFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "StableSwapFacet complexity check"


# certoraRun  contracts/core/connext/facets/VersionFacet.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify VersionFacet:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "VersionFacet complexity check"


# certoraRun  contracts/core/connext/facets/upgrade-initializers/DiamondInit.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify DiamondInit:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "DiamondInit complexity check"


# certoraRun  contracts/core/connext/helpers/ConnextPriceOracle.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify ConnextPriceOracle:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "ConnextPriceOracle complexity check"


# certoraRun  contracts/core/connext/helpers/ConnextProxyAdmin.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify ConnextProxyAdmin:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "ConnextProxyAdmin complexity check"


# certoraRun  contracts/core/connext/helpers/Executor.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify Executor:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "Executor complexity check"


# certoraRun  contracts/core/connext/helpers/LPToken.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify LPToken:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "LPToken complexity check"
    

# certoraRun  contracts/core/connext/helpers/SponsorVault.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify SponsorVault:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "SponsorVault complexity check"


# certoraRun  contracts/core/connext/helpers/StableSwap.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify StableSwap:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "StableSwap complexity check"


# certoraRun  contracts/core/promise/PromiseRouter.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify PromiseRouter:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "PromiseRouter complexity check"


# certoraRun  contracts/core/relayer-fee/RelayerFeeRouter.sol ComplexityCheck/DummyERC20A.sol ComplexityCheck/DummyERC20B.sol \
#     --verify RelayerFeeRouter:ComplexityCheck/complexity.spec \
#     --solc solc8.14 \
#     --staging \
#     --optimistic_loop \
#     --send_only \
#     --packages @openzeppelin=node_modules/@openzeppelin \
#     --msg "RelayerFeeRouter complexity check"
    
    


    # --packages_path node_modules \
    # --packages @openzeppelin=node_modules/@openzeppelin @bancor=node_modules/@bancor \