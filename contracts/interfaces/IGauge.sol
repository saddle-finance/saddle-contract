// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

/// @title IGauge interface
/// @notice This interface can be used for any contracts that has
/// gauge like functionalities.
interface IGauge {
    function deposit(uint256) external;

    function withdraw(uint256) external;

    function lp_token() external view returns (address);

    function set_rewards_receiver(address) external;

    // Below are ChildGauge specific methods. Using them for
    // other contracts will result in revert.

    function SDL() external view returns (address);

    function FACTORY() external view returns (address);
}
