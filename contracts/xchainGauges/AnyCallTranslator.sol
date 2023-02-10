// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-4.7.3/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts-4.7.3/utils/math/Math.sol";
import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts-upgradeable-4.7.3/access/OwnableUpgradeable.sol";

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

// Empty contract to ensure hardhat import of TransparentUpgradeableProxy contract
contract EmptyProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) payable TransparentUpgradeableProxy(_logic, admin_, _data) {}
}

// Empty contract to ensure hardhat import of ProxyAdmin contract
contract EmptyProxyAdmin is ProxyAdmin {

}

/// @title AnyCallTranslator also know as the AnyCallProxy
/// @notice AnyCallTranslator is responsible for translating messages for AnyCallV6
contract AnyCallTranslator is OwnableUpgradeable {
    using SafeERC20 for IERC20;
    // address of anyCallV6 contract
    address public anyCallContract;
    // address of the AnyCallExecutor contract
    address public anyCallExecutor;
    // mapping of address to whether or not they are allowed to call anyCall
    mapping(address => bool) public isKnownCaller;

    /// @notice AnyCallTranslator constructor
    /// @dev Doesn't do anything except to set isInitialized = true via initializer
    constructor() initializer {
        // Do not do anything on logic contract deployment
        // intializer modifier will prevent any future `initialize()` calls
    }

    receive() external payable {
        // fallback payable function
    }

    /// @notice Initialize the AnyCallTranslator contract for proxies
    /// @dev This needs to be called on proxies of this contract
    /// @param _owner address that will be the owner of this contract
    /// @param _anyCallContract address of the anyCallV6 contract
    function initialize(address _owner, address _anyCallContract)
        public
        initializer
    {
        _transferOwnership(_owner);
        anyCallContract = _anyCallContract;
        anyCallExecutor = ICallProxy(_anyCallContract).executor();
    }

    /// @notice Adds addresses to known caller array
    /// @dev Only callable by owner
    /// @param _callers array of addresses that should be added to known callers
    function addKnownCallers(address[] calldata _callers) external onlyOwner {
        for (uint256 i = 0; i < _callers.length; i++) {
            isKnownCaller[_callers[i]] = true;
        }
    }

    /// @notice Removes addresses from known caller array
    /// @dev Only callable by owner
    function removeKnownCallers(address[] calldata _callers)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < _callers.length; i++) {
            isKnownCaller[_callers[i]] = false;
        }
    }

    /// @notice Set the AnyCall contract address
    /// @dev Only callable by owner
    /// @param _anyCallContract address of the AnyCallV6 contract
    function setAnyCall(address _anyCallContract) external onlyOwner {
        anyCallContract = _anyCallContract;
        anyCallExecutor = ICallProxy(_anyCallContract).executor();
    }

    /// @notice withdraw any ETH that was sent to AnyCall contract
    /// @dev Only callable by owner
    /// @param _amount amount of ETH to withdraw
    function withdraw(uint256 _amount) external onlyOwner {
        ICallProxy(anyCallContract).withdraw(_amount);
    }

    /// @notice Rescue any ERC20 tokens that are stuck in this contract
    /// @dev Only callable by owner
    /// @param token address of the ERC20 token to rescue. Use zero address for ETH
    /// @param to address to send the tokens to
    /// @param balance amount of tokens to rescue
    function rescue(
        IERC20 token,
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

    /// @notice Send a cross chain call via anyCallV6
    /// @dev Only callable by known callers. Fee flags should be set to 2 in most
    /// if not all use cases involing this contract.
    /// @param _to address to call
    /// @param _data calldata with function signature to use
    /// @param _fallback address of the fallback contract to use if the call fails
    /// @param _toChainId chainId to send the call to
    /// @param _flags flags for determining on which network should caller pay the fee
    /// (0 = desitnation chain, 2 = origin chain)
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

    /// @notice Receive a cross chain call via anyCallV6 and execute a call on this network
    /// @dev Only callable anyCallExecutor, the executor contract of anyCallV6
    /// @param toAndData abi encoded target address and function calldata to execute
    /// @return boolean indicating success of the call
    /// @return bytes any data returned from the call
    function anyExecute(bytes calldata toAndData)
        external
        returns (bool, bytes memory)
    {
        // Check that caller is anycall executor
        require(
            msg.sender == anyCallExecutor,
            "Caller is not anyCall executor"
        );
        // Get the address of the caller from the source chain
        (address _from, , ) = IAnyCallExecutor(msg.sender).context();
        // Check that caller is AnyCallTranslator
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
