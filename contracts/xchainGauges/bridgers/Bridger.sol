// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/access/Ownable.sol";
import "@openzeppelin/contracts-4.7.3/security/Pausable.sol";

/// @title Abstract contract for bridging tokens between chains
/// @notice Defines the interface for bridger contracts with
/// basic owner and pause functionality. Owner is set to the
/// deployer of the contract.
abstract contract Bridger is Ownable, Pausable {
    /// @notice Pause the bridger
    /// @dev Only the owner can call this function and overriding contracts
    /// should implement `whenNotPaused` modifier to their bridge function
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice Unpause the bridger
    /// @dev Only the owner can call this function
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @notice Check if an account can use this bridger contract
    /// @param sender The address of the sender
    /// @return True if the bridger can be used by the sender
    function check(address sender) external view virtual returns (bool);

    /// @notice Bridge tokens from the current chain to the target chain
    /// @dev The overriding contract should implement `whenNotPaused` modifier
    /// @param token The address of the token to bridge
    /// @param to The address to send the bridged tokens to
    /// @param amount The amount of tokens to bridge
    function bridge(
        address token,
        address to,
        uint256 amount
    ) external payable virtual;

    /// @notice Get the cost of bridging tokens. This depends on each
    /// bridger contract and the current state of the chain.
    /// @return The cost of bridging tokens
    function cost() external view virtual returns (uint256);

    /// @notice Fallback function for receiving ETH
    receive() external payable virtual {}
}
