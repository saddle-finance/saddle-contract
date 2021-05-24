// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/proxy/Proxy.sol";

/**
 * @dev This contract is a minimal version of UpgradeableProxy.
 */
contract FixedProxy is Proxy {
    /**
     * @dev Initializes the upgradeable proxy with an initial implementation specified by `_logic`.
     *
     * If `_data` is nonempty, it's used as data in a delegate call to `_logic`. This will typically be an encoded
     * function call, and allows initializating the storage of the proxy like a Solidity constructor.
     */
    constructor(address _logic) public {
        bytes32 slot = _IMPLEMENTATION_SLOT;
        assert(slot == bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1));

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, _logic)
        }
    }

    /**
     * @dev Storage slot with the address of the current implementation.
     * This is the keccak-256 hash of "eip1967.proxy.implementation" subtracted by 1, and is
     * validated in the constructor.
     */
    bytes32 private constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /**
     * @dev Returns the current implementation address.
     */
    function _implementation() internal view virtual override returns (address impl) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            impl := sload(_IMPLEMENTATION_SLOT)
        }
    }
}