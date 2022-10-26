// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.4.0/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-4.4.0/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts-4.4.0/utils/math/Math.sol";

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

    function withdraw(uint256 amount) external;

    function executor() external view returns (address executor);
}

interface IAnyCallExecutor {
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
    address public anyCallContract;
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
        anyCallContract = _anycallContract;
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

    function setAnyCall(address _anyCallContract) external onlyOwner {
        anyCallContract = _anyCallContract;
        anyCallExecutor = ICallProxy(_anyCallContract).executor();
    }

    function withdraw(uint256 _amount) external onlyOwner {
        ICallProxy(anyCallContract).withdraw(_amount);
    }

    function rescue(
        IERC20Upgradeable token,
        address to,
        uint256 balance
    ) external onlyOwner {
        if (address(token) == address(0)) {
            // for Ether
            uint256 totalBalance = address(this).balance;
            balance = balance == 0
                ? totalBalance
                : Math.min(totalBalance, balance);
            require(balance > 0, "trying to send 0 ETH");
            // slither-disable-next-line arbitrary-send
            (bool success, ) = to.call{value: balance}("");
            require(success, "ETH transfer failed");
        } else {
            // any other erc20
            uint256 totalBalance = token.balanceOf(address(this));
            balance = balance == 0
                ? totalBalance
                : Math.min(totalBalance, balance);
            require(balance > 0, "trying to send 0 balance");
            token.safeTransfer(to, balance);
        }
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
        ICallProxy(anyCallContract).anyCall{value: msg.value}(
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
            "Caller is not anyCall executor"
        );
        // Get address of anycallExecutor
        (address _from, , ) = IAnyCallExecutor(msg.sender).context();
        // Check that caller is verified
        require(_from == address(this), "Wrong context");

        // Decode to and data
        (address to, bytes memory data) = abi.decode(
            toAndData,
            (address, bytes)
        );
        (bool success, bytes memory returnData) = to.call(data);
        require(success, "Target call failed");
        return (success, returnData);
    }
}
