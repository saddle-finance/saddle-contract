// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

/// @title IMinterLike interface
/// @notice This interface can be used for any contracts that has
/// minter like functionalities. For example ChildGaugeFactory
/// on a side chain is a minter like contract.
interface IMinterLike {
    function mint(address gauge) external;
}
