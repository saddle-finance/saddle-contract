// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "../contracts/interfaces/IMasterRegistry.sol";

interface IPoolRegistry {
    /* Structs */

    struct PoolInputData {
        address poolAddress;
        uint8 typeOfAsset;
        bytes32 poolName;
        address targetAddress;
        address metaSwapDepositAddress;
        bool isSaddleApproved;
        bool isRemoved;
        bool isGuarded;
    }

    struct PoolData {
        address poolAddress;
        address lpToken;
        uint8 typeOfAsset;
        bytes32 poolName;
        address targetAddress;
        address[] tokens;
        address[] underlyingTokens;
        address basePoolAddress;
        address metaSwapDepositAddress;
        bool isSaddleApproved;
        bool isRemoved;
        bool isGuarded;
    }

    struct SwapStorageData {
        uint256 initialA;
        uint256 futureA;
        uint256 initialATime;
        uint256 futureATime;
        uint256 swapFee;
        uint256 adminFee;
        address lpToken;
    }

    /* Public Variables */

    function poolsIndexOfPlusOne(address poolAddress)
        external
        returns (uint256);

    function poolsIndexOfNamePlusOne(bytes32 poolName)
        external
        returns (uint256);

    /* Functions */

    function addPool(PoolInputData memory inputData) external payable;

    function addCommunityPool(PoolData memory data) external payable;

    function approvePool(address poolAddress) external payable;

    function updatePool(PoolData memory poolData) external payable;

    function removePool(address poolAddress) external payable;

    function getPoolData(address poolAddress)
        external
        view
        returns (PoolData memory);

    function getPoolDataAtIndex(uint256 index)
        external
        view
        returns (PoolData memory);

    function getPoolDataByName(bytes32 poolName)
        external
        view
        returns (PoolData memory);

    function getVirtualPrice(address poolAddress)
        external
        view
        returns (uint256);

    function getA(address poolAddress) external view returns (uint256);

    function getPaused(address poolAddress) external view returns (bool);

    function getSwapStorage(address poolAddress)
        external
        view
        returns (SwapStorageData memory swapStorageData);

    function getTokens(address poolAddress)
        external
        view
        returns (address[] memory);

    function getUnderlyingTokens(address poolAddress)
        external
        view
        returns (address[] memory);

    function getPoolsLength() external view returns (uint256);

    function getEligiblePools(address from, address to)
        external
        view
        returns (address[] memory eligiblePools);

    function getTokenBalances(address poolAddress)
        external
        view
        returns (uint256[] memory balances);

    function getUnderlyingTokenBalances(address poolAddress)
        external
        view
        returns (uint256[] memory balances);
}

contract PoolRegistryCheckScript is Script {
    mapping(uint256 => address) masterRegistryMap;

    function setUp() public {
        masterRegistryMap[1] = 0xc5ad17b98D7fe73B6dD3b0df5b3040457E68C045;
        masterRegistryMap[10] = 0x0E510c9b20a5D136E75f7FD2a5F344BD98f9d875;
        masterRegistryMap[42161] = 0xaB94A2c0D8F044AA439A5654f06b5797928396cF;
    }

    function run() public {
        // https://github.com/foundry-rs/forge-std/blob/master/src/Vm.sol
        vm.startBroadcast();

        // Find MasterRegistry
        address masterRegistry = masterRegistryMap[block.chainid];
        require(masterRegistry != address(0), "Invalid chainId");

        // Find PoolRegistry
        address poolRegistry = IMasterRegistry(masterRegistry)
            .resolveNameToLatestAddress("PoolRegistry");
        require(poolRegistry != address(0), "Invalid pool registry");

        IMasterRegistry mr = IMasterRegistry(masterRegistry);
        IPoolRegistry pr = IPoolRegistry(poolRegistry);

        console.log(
            "PoolRegistry on chainid %s: %s",
            block.chainid,
            address(pr)
        );

        uint256 numOfPools = pr.getPoolsLength();
        console.log("Number of pools %s", numOfPools);

        // For every pool, print tokens in array format
        for (uint256 i = 0; i < numOfPools; i++) {
            IPoolRegistry.PoolData memory poolData = pr.getPoolDataAtIndex(i);
            console.log(
                "index %s: %s",
                i,
                string(abi.encodePacked(poolData.poolName))
            );
            string memory tokens;
            for (uint256 j = 0; j < poolData.tokens.length; j++) {
                tokens = string(
                    abi.encodePacked(
                        tokens,
                        vm.toString(poolData.tokens[j]),
                        ", "
                    )
                );
            }
            console.log("tokens: [%s]\n", tokens);
        }

        vm.stopBroadcast();
    }
}
