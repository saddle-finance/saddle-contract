// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ScriptWithConstants.s.sol";
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

    /* Functions */

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

    function getTokens(address poolAddress)
        external
        view
        returns (address[] memory);

    function getUnderlyingTokens(address poolAddress)
        external
        view
        returns (address[] memory);

    function getPoolsLength() external view returns (uint256);

    function getTokenBalances(address poolAddress)
        external
        view
        returns (uint256[] memory balances);

    function getUnderlyingTokenBalances(address poolAddress)
        external
        view
        returns (uint256[] memory balances);
}

contract PoolRegistryCheckScript is ScriptWithConstants {
    function setUp() public override {
        super.setUp();
    }

    function printPools() public {
        // Find MasterRegistry
        address masterRegistry = getDeploymentAddress("MasterRegistry");
        require(masterRegistry != address(0), "No master registry found");
        console.log("MasterRegistry address: %s", masterRegistry);

        // Find PoolRegistry
        address poolRegistry = IMasterRegistry(masterRegistry)
            .resolveNameToLatestAddress("PoolRegistry");
        console.log("PoolRegistry address: %s", poolRegistry);
        require(poolRegistry != address(0), "No pool registry found");

        IMasterRegistry mr = IMasterRegistry(masterRegistry);
        IPoolRegistry pr = IPoolRegistry(poolRegistry);

        console.log(
            "PoolRegistry on %s (%s): %s\n",
            getNetworkName(),
            block.chainid,
            address(pr)
        );

        uint256 numOfPools = pr.getPoolsLength();
        console.log("Number of pools %s", numOfPools);

        // For every pool, print tokens in array format
        for (uint256 i = 0; i < numOfPools; i++) {
            // Find the pool data at index i
            IPoolRegistry.PoolData memory poolData = pr.getPoolDataAtIndex(i);
            console.log(
                "index %s: %s",
                i,
                string(abi.encodePacked(poolData.poolName))
            );

            // Print the pooled token addresses
            string memory tokens;
            for (uint256 j = 0; j < poolData.tokens.length; j++) {
                string memory suffix = j + 1 != poolData.tokens.length
                    ? ", "
                    : "";
                tokens = string(
                    abi.encodePacked(
                        tokens,
                        vm.toString(poolData.tokens[j]),
                        suffix
                    )
                );
            }
            console.log("tokens: [%s]", tokens);

            // Print the pooled token balances
            string memory balancesOutput;
            uint256[] memory balances = pr.getTokenBalances(
                poolData.poolAddress
            );
            for (uint256 j = 0; j < poolData.tokens.length; j++) {
                string memory suffix = j + 1 != poolData.tokens.length
                    ? ", "
                    : "";
                balancesOutput = string(
                    abi.encodePacked(
                        balancesOutput,
                        vm.toString(balances[j]),
                        suffix
                    )
                );
            }
            console.log("balances: [%s]\n", balancesOutput);
        }
    }

    function run() public {
        // https://github.com/foundry-rs/forge-std/blob/master/src/Vm.sol
        vm.startBroadcast();

        for (uint256 i = 0; i < networkNames.length; i++) {
            vm.createSelectFork(networkNames[i]);
            printPools();
        }

        vm.stopBroadcast();
    }
}
