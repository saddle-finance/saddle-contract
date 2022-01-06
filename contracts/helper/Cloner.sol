// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts-4.2.0/proxy/Clones.sol";

/**
 * @title Cloner helper contract used to create minimal proxies
 */
contract Cloner {
    function clone(address implementation) external returns (address) {
        return Clones.clone(implementation);
    }
}
