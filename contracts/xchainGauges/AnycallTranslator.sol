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
    ) external payable; // nonpayable

    function deposit(address _account) external payable;

    function withdraw(uint256 amount) external;

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
    address public anyCallExecutor;
    mapping(address => bool) public isKnownCaller;

    constructor() initializer {
        // logic contract
    }

    receive() external payable {
        // fallback payable function
    }

    function initialize(address _owner, address _anycallContract)
        public
        initializer
    {
        _transferOwnership(_owner);
        anycallContract = _anycallContract;
        anyCallExecutor = ICallProxy(_anycallContract).executor();
    }

    function addKnownCallers(address[] calldata _callers) external onlyOwner {
        for (uint256 i = 0; i < _callers.length; i++) {
            isKnownCaller[_callers[i]] = true;
        }
    }

    function removeKnownCallers(address[] calldata _callers)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < _callers.length; i++) {
            isKnownCaller[_callers[i]] = false;
        }
    }

    function setAnycall(address _anycallContract) external onlyOwner {
        anycallContract = _anycallContract;
        anyCallExecutor = ICallProxy(_anycallContract).executor();
    }

    function withdraw(uint256 _amount) external onlyOwner {
        ICallProxy(anycallContract).withdraw(_amount);
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
        require(isKnownCaller[msg.sender], "Unknown caller");
        ICallProxy(anycallContract).anyCall{value: msg.value}(
            address(this),
            abi.encode(_to, _data),
            _fallback,
            _toChainId,
            _flags
        );
    }

    function anyExecute(bytes calldata toAndData)
        external
        returns (bool, bytes memory)
    {
        // Check that caller is anycall executor
        require(
            msg.sender == anyCallExecutor,
            "Caller is not anycall executor"
        );
        // Get address of anycallExecutor
        (address _from, , ) = IAnycallExecutor(msg.sender).context();
        // Check that caller is verified
        require(_from == address(this), "Wrong context");

        // Decode to and data
        (address to, bytes memory data) = abi.decode(
            toAndData,
            (address, bytes)
        );
        (bool success, bytes memory returnData) = to.call(data);
        require(success, "Proxy call failed");
        return (success, returnData);
    }
}
