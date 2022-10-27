// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ScriptWithConstants.s.sol";
import "./PriceHelper.sol";
import "./JsonFormatter.sol";
import "../contracts/interfaces/IMasterRegistry.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";

interface ISwap {
    function paused() external view returns (bool);

    function getVirtualPrice() external view returns (uint256);

    function getA() external view returns (uint256);
}

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

struct PoolDataJsonOutput {
    address poolAddress;
    uint64 chainId;
    uint8 typeOfAsset;
    address lpToken;
    bytes32 poolName;
    address targetAddress;
    bool isSaddleApproved;
    bool isRemoved;
    bool isGuarded;
    bool isPaused;
    address[] tokens;
    address[] underlyingTokens;
    address basePoolAddress;
    address metaSwapDepositAddress;
    uint64 virtualPrice;
    uint32 a;
    uint256 tvl;
    uint256 rawTvl;
    string tokenBalances;
    uint256[] underlyingTokenBalances;
}

contract PoolRegistryCheckScript is ScriptWithConstants, JsonFormatter {
    IMasterRegistry mr;
    IPoolRegistry pr;

    uint256 btcPrice;
    uint256 ethPrice;
    uint256 usdPrice;

    uint256 totalSaddleTVL;

    PoolDataJsonOutput[] poolDataJsonOutputs;

    function setUp() public override {
        super.setUp();
        (btcPrice, ethPrice, usdPrice) = (new PriceHelper()).getLatestPrices();
    }

    function printTokenAddresses(IPoolRegistry.PoolData memory poolData)
        public
    {
        console.log("tokens: [%s]", formatArrayString(poolData.tokens));
    }

    function printTokenBalances(IPoolRegistry.PoolData memory poolData)
        public
        returns (string memory)
    {
        string memory balancesOutput;
        balancesOutput = formatArrayString(
            pr.getTokenBalances(poolData.poolAddress)
        );
        console.log("balances: [%s]", balancesOutput);
        return balancesOutput;
    }

    function calculatePoolTVL(IPoolRegistry.PoolData memory poolData)
        public
        returns (uint256 poolTVL, uint256 withoutBaseLPToken)
    {
        uint256 totalSupply = IERC20(poolData.lpToken).totalSupply();
        uint256 virtualPrice = pr.getVirtualPrice(poolData.poolAddress);
        uint256 price;
        if (poolData.typeOfAsset == 0) {
            price = btcPrice;
        } else if (poolData.typeOfAsset == 1) {
            price = ethPrice;
        } else if (poolData.typeOfAsset == 2) {
            price = usdPrice;
        } else {
            price = 0;
        }
        poolTVL = (totalSupply * virtualPrice * price) / (1e18 * 1e8);
        withoutBaseLPToken = poolTVL;

        if (poolData.basePoolAddress != address(0)) {
            uint256[] memory balances = pr.getTokenBalances(
                poolData.poolAddress
            );
            withoutBaseLPToken =
                ((totalSupply - balances[balances.length - 1]) *
                    virtualPrice *
                    price) /
                (1e18 * 1e8);
        }

        return (poolTVL, withoutBaseLPToken);
    }

    function printPools() public {
        console.log(
            "** Pools on %s (%s) **\n",
            getNetworkName(),
            block.chainid
        );

        // Find MasterRegistry
        address masterRegistry = getDeploymentAddress("MasterRegistry");
        require(masterRegistry != address(0), "No master registry found");
        console.log("MasterRegistry address: %s", masterRegistry);
        mr = IMasterRegistry(masterRegistry);

        // Find PoolRegistry
        address poolRegistry = mr.resolveNameToLatestAddress("PoolRegistry");
        require(poolRegistry != address(0), "No pool registry found");
        console.log("PoolRegistry address: %s", poolRegistry);
        pr = IPoolRegistry(poolRegistry);

        uint256 numOfPools = pr.getPoolsLength();
        console.log("Number of pools %s", numOfPools);

        uint256 tvlPerChain = 0;

        // For every pool, print tokens in array format
        for (uint256 i = 0; i < numOfPools; i++) {
            // Find the pool data at index i and print the pool address
            IPoolRegistry.PoolData memory poolData = pr.getPoolDataAtIndex(i);
            console.log(
                "index %s: %s (%s)",
                i,
                string(abi.encodePacked(poolData.poolName)),
                poolData.poolAddress
            );

            // Print the pooled token addresses
            printTokenAddresses(poolData);

            // Print the pooled token balances
            string memory balancesOutput = printTokenBalances(poolData);

            // Calculate and print TVL of the pool
            (uint256 poolTVL, uint256 tvlWithoutBaseLPToken) = calculatePoolTVL(
                poolData
            );
            console.log(
                "TVL: $%s ($%s)\n",
                poolTVL / 1e18,
                tvlWithoutBaseLPToken / 1e18
            );

            // Push to array for JSON output
            poolDataJsonOutputs.push(
                PoolDataJsonOutput({
                    chainId: uint64(block.chainid),
                    poolAddress: poolData.poolAddress,
                    lpToken: poolData.lpToken,
                    typeOfAsset: poolData.typeOfAsset,
                    poolName: poolData.poolName,
                    targetAddress: poolData.targetAddress,
                    tokens: poolData.tokens,
                    underlyingTokens: poolData.underlyingTokens,
                    basePoolAddress: poolData.basePoolAddress,
                    metaSwapDepositAddress: poolData.metaSwapDepositAddress,
                    isSaddleApproved: poolData.isSaddleApproved,
                    isRemoved: poolData.isRemoved,
                    isGuarded: poolData.isGuarded,
                    isPaused: ISwap(poolData.poolAddress).paused(),
                    virtualPrice: uint64(
                        ISwap(poolData.poolAddress).getVirtualPrice()
                    ),
                    a: uint32(ISwap(poolData.poolAddress).getA()),
                    tvl: poolTVL,
                    rawTvl: tvlWithoutBaseLPToken,
                    tokenBalances: balancesOutput,
                    underlyingTokenBalances: poolData.basePoolAddress !=
                        address(0)
                        ? pr.getUnderlyingTokenBalances(poolData.poolAddress)
                        : new uint256[](0)
                })
            );

            tvlPerChain += tvlWithoutBaseLPToken;
            totalSaddleTVL += tvlWithoutBaseLPToken;
        }

        console.log(
            "Total %s TVL: $%s\n",
            getNetworkName(),
            tvlPerChain / 1e18
        );
    }

    function writeToJson(PoolDataJsonOutput[] memory outputs) public {
        string memory root = vm.projectRoot();
        string memory json = "[";

        for (uint256 i = 0; i < outputs.length; i++) {
            json = string.concat(
                json,
                '{"chainId": ',
                vm.toString(outputs[i].chainId),
                ', "poolAddress": "',
                vm.toString(outputs[i].poolAddress),
                '", "lpToken": "',
                vm.toString(outputs[i].lpToken),
                '", "typeOfAsset": ',
                vm.toString(outputs[i].typeOfAsset)
            );
            json = string.concat(
                json,
                ', "poolName": "',
                bytes32ToString(outputs[i].poolName),
                '", "targetAddress": "',
                vm.toString(outputs[i].targetAddress),
                '", "tokens": ',
                formatArrayString(outputs[i].tokens),
                ', "underlyingTokens": ',
                formatArrayString(outputs[i].underlyingTokens),
                ', "basePoolAddress": "',
                vm.toString(outputs[i].basePoolAddress)
            );
            json = string.concat(
                json,
                '", "metaSwapDepositAddress": "',
                vm.toString(outputs[i].metaSwapDepositAddress),
                '", "isSaddleApproved": ',
                vm.toString(outputs[i].isSaddleApproved),
                ', "isRemoved": ',
                vm.toString(outputs[i].isRemoved),
                ', "isGuarded": ',
                vm.toString(outputs[i].isGuarded),
                ', "isPaused": ',
                vm.toString(outputs[i].isPaused),
                ', "virtualPrice": ',
                vm.toString(outputs[i].virtualPrice)
            );
            json = string.concat(
                json,
                ', "a": ',
                vm.toString(outputs[i].a),
                ', "tvl": ',
                vm.toString(outputs[i].tvl),
                ', "rawTvl": ',
                vm.toString(outputs[i].rawTvl),
                ', "tokenBalances": ',
                outputs[i].tokenBalances,
                ', "underlyingTokenBalances": ',
                formatArrayString(outputs[i].underlyingTokenBalances),
                "}",
                i == outputs.length - 1 ? "" : ", "
            );
        }
        json = string.concat(json, "]");

        vm.writeFile(
            string.concat(
                root,
                "/output/",
                getNetworkName(),
                "_",
                vm.toString(block.timestamp),
                ".json"
            ),
            json
        );
    }

    function run() public {
        // https://github.com/foundry-rs/forge-std/blob/master/src/Vm.sol
        vm.startBroadcast();

        for (uint256 i = 0; i < networkNames.length; i++) {
            vm.createSelectFork(networkNames[i]);
            printPools();
            writeToJson(poolDataJsonOutputs);
            delete poolDataJsonOutputs;
        }

        console.log("Total Saddle TVL: $%s", totalSaddleTVL / 1e18);

        vm.stopBroadcast();
    }
}
