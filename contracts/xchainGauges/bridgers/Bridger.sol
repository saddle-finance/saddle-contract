// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.4.0/access/Ownable.sol";
import "@openzeppelin/contracts-4.4.0/security/Pausable.sol";

abstract contract Bridger is Ownable, Pausable {
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    function check(address sender) external view virtual returns (bool);

    function bridge(
        address token,
        address to,
        uint256 amount
    ) external payable virtual;

    function cost() external view virtual returns (uint256);

    receive() external payable virtual;
}
