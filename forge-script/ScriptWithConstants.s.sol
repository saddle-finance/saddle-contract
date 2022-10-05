// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";

struct Network {
    uint256 chainId;
    string networkName;
}

contract ScriptWithConstants is Script {
    using stdJson for string;

    // helper variables
    string[] public networkNames;
    mapping(string => uint256) public networkNameToChainId;
    mapping(uint256 => string) public chainIdToNetworkName;

    function setUp() public virtual {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/forge-script/networks.json");
        string memory json = vm.readFile(path);
        Network[] memory networks = abi.decode(vm.parseJson(json), (Network[]));

        for (uint256 i = 0; i < networks.length; i++) {
            Network memory network = networks[i];
            networkNameToChainId[network.networkName] = network.chainId;
            chainIdToNetworkName[network.chainId] = network.networkName;
            networkNames.push(network.networkName);
        }
    }

    function getNetworkChainId(string memory networkName)
        public
        view
        returns (uint256)
    {
        uint256 chainId = networkNameToChainId[networkName];
        require(chainId != 0, "invalid network name");
        return chainId;
    }

    function getNetworkName() public view returns (string memory) {
        return getNetworkName(block.chainid);
    }

    function getNetworkName(uint256 chainId)
        public
        view
        returns (string memory)
    {
        string memory networkName = chainIdToNetworkName[chainId];
        require(bytes(networkName).length != 0, "invalid chain id");
        return networkName;
    }

    function getDeploymentAddress(string memory deploymentJsonName)
        public
        returns (address)
    {
        return getDeploymentAddress(deploymentJsonName, block.chainid);
    }

    function getDeploymentAddress(
        string memory deploymentJsonName,
        uint256 chainId
    ) public returns (address) {
        console.log(
            "Reading deployment address for %s on chainId %s",
            deploymentJsonName,
            chainId
        );
        string memory root = vm.projectRoot();
        string memory networkName = getNetworkName(chainId);
        string memory path = string.concat(
            root,
            "/deployments/",
            networkName,
            "/",
            deploymentJsonName,
            ".json"
        );
        string memory json = vm.readFile(path);
        address addr = json.readAddress(".address");
        require(addr != address(0), "invalid address");
        return addr;
    }
}
