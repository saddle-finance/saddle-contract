// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "../interfaces/IMasterRegistry.sol";

abstract contract ShareProtocolFee {
    IMasterRegistry public immutable MASTER_REGISTRY;
    bytes32 public constant FEE_COLLECTOR_NAME =
        0x466565436f6c6c6563746f720000000000000000000000000000000000000000;
    address public feeCollector;

    constructor(IMasterRegistry _masterRegistry) public {
        MASTER_REGISTRY = _masterRegistry;
        _updateFeeCollectorCache(_masterRegistry);
    }

    /**
     * @notice Updates cached address of the fee collector
     */
    function updateFeeCollectorCache() public payable virtual {
        _updateFeeCollectorCache(MASTER_REGISTRY);
    }

    function _updateFeeCollectorCache(IMasterRegistry masterRegistry)
        internal
        virtual
    {
        address _feeCollector = masterRegistry.resolveNameToLatestAddress(
            FEE_COLLECTOR_NAME
        );
        require(_feeCollector != address(0), "Fee collector cannot be empty");
        feeCollector = _feeCollector;
    }

    /**
     * @notice Withdraws admin fees to appropriate addresses
     */
    function withdrawAdminFees() external payable virtual;
}
