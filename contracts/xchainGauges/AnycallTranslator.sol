// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.4.0/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-4.4.0/proxy/transparent/ProxyAdmin.sol";

import "@openzeppelin/contracts-upgradeable-4.4.0/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable-4.4.0/access/OwnableUpgradeable.sol";

interface ICallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        uint256 _flags
    ) external; // nonpayable

    function deposit(address _account) external payable;

    function executor() external view returns (address executor);
}

interface IAnycallExecutor {
    function context()
        external
        view
        returns (
            address from,
            uint256 fromChainID,
            uint256 nonce
        );
}

// Empty contract to ensure import of TransparentUpgradeableProxy contract
contract EmptyProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) payable TransparentUpgradeableProxy(_logic, admin_, _data) {}
}

// Empty contract to ensure import of ProxyAdmin contract
contract EmptyProxyAdmin is ProxyAdmin {

}

// Logic contract that will be used by the proxy
contract AnyCallTranslator is OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    // consts
    address public anycallContract;
    address public oracleContract;
    address public gaugeFactory;
    address public verifiedcaller;

    constructor() initializer {
        // logic contract
    }

    function initialize(address _owner, address _anycallContract)
        public
        initializer
    {
        _transferOwnership(_owner);
        anycallContract = _anycallContract;
    }

    function setAnycall(address _anycallContract) external onlyOwner {
        anycallContract = _anycallContract;
    }

    function setOracle(address _oracleContract) external onlyOwner {
        oracleContract = _oracleContract;
    }

    function setGaugeFactory(address _gaugeFactory) external onlyOwner {
        gaugeFactory = _gaugeFactory;
    }

    function deposit(address _account) external payable {
        ICallProxy(anycallContract).deposit(_account);
    }

    function rescue(IERC20Upgradeable token, address to) external onlyOwner {
        token.safeTransfer(to, token.balanceOf(address(this)));
    }

    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        // Use 0 flag to pay fee on destination chain, 1 to pay on source
        uint256 _flags
    ) external payable {
        ICallProxy(anycallContract).anyCall(
            _to,
            _data,
            _fallback,
            _toChainId,
            _flags
        );
    }

    function anyExecute(bytes calldata data)
        external
        returns (bool, bytes memory)
    {
        // Get address of anycallExecutor
        (address _from, , ) = IAnycallExecutor(msg.sender).context();
        // Check that caller is verified
        require(_from == address(this), "AnycallClient: wrong context");

        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        if (selector == 0x72a733fc) {
            // deploy_gauge(uint256,bytes32,string)
            // Root Gauge Facotry call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
            // Pass encoded function call to gauge factory, require ensures that the call is successful
            (bool success, bytes memory returnedData) = gaugeFactory.call(data);
            require(success, "Root Gauge Deploy Execution Failed");
            return (success, returnedData);
        } else if (selector == 0x6be320d2) {
            // "deploy_gauge(address, bytes32, address)"
            // Child Gauge Facotry call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
            // Pass encoded function call to gauge factory, require ensures that the call is successful
            (bool success, bytes memory returnedData) = gaugeFactory.call(data);
            require(success, "Child Gauge Deploy Execution Failed");
            return (success, returnedData);
        } else if (selector == 0xc80fbe4e) {
            // "push(uint256 _chainId, address _user)"
            // Oracle Push Call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
            (bool success, bytes memory returnedData) = oracleContract.call(
                data
            );
            require(success, "Oracle Push Execution Failed");
            return (success, returnedData);
        } else {
            revert("Unknown selector");
        }
    }
}
