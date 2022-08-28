// SPDX-License-Identifier: MIT WITH AGPL-3.0-only

pragma solidity 0.6.12;

import "./PermissionlessSwap.sol";
import "../interfaces/IFlashLoanReceiver.sol";

abstract contract FlashLoanEnabled {
    // Total fee that is charged on all flashloans in BPS. Borrowers must repay the amount plus the flash loan fee.
    // This fee is split between the protocol and the pool.
    uint256 public flashLoanFeeBPS;
    // Share of the flash loan fee that goes to the protocol in BPS. A portion of each flash loan fee is allocated
    // to the protocol rather than the pool.
    uint256 public protocolFeeShareBPS;
    // Max BPS for limiting flash loan fee settings.
    uint256 public constant MAX_BPS = 10000;

    /*** EVENTS ***/
    event FlashLoan(
        address indexed receiver,
        uint8 tokenIndex,
        uint256 amount,
        uint256 amountFee,
        uint256 protocolFee
    );

    /**
     * @notice Borrow the specified token from this pool for this transaction only. This function will call
     * `IFlashLoanReceiver(receiver).executeOperation` and the `receiver` must return the full amount of the token
     * and the associated fee by the end of the callback transaction. If the conditions are not met, this call
     * is reverted.
     * @param receiver the address of the receiver of the token. This address must implement the IFlashLoanReceiver
     * interface and the callback function `executeOperation`.
     * @param token the protocol fee in bps to be applied on the total flash loan fee
     * @param amount the total amount to borrow in this transaction
     * @param params optional data to pass along to the callback function
     */
    function flashLoan(
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes memory params
    ) external payable virtual;

    /**
     * @notice Updates the flash loan fee parameters.
     * @dev This function should be overridden for permissions.
     * @param newFlashLoanFeeBPS the total fee in bps to be applied on future flash loans
     * @param newProtocolFeeShareBPS the protocol fee in bps to be applied on the total flash loan fee
     */
    function _setFlashLoanFees(
        uint256 newFlashLoanFeeBPS,
        uint256 newProtocolFeeShareBPS
    ) internal {
        require(
            newFlashLoanFeeBPS > 0 &&
                newFlashLoanFeeBPS <= MAX_BPS &&
                newProtocolFeeShareBPS <= MAX_BPS,
            "fees are not in valid range"
        );
        flashLoanFeeBPS = newFlashLoanFeeBPS;
        protocolFeeShareBPS = newProtocolFeeShareBPS;
    }
}
