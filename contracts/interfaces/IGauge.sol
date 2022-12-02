// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

/**
 * @title IGauge interface
 **/
interface IGauge {
    function deposit(uint256) external;

    function withdraw(uint256) external;

    function lp_token() external view returns (address);
}
