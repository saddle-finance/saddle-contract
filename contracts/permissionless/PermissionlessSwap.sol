// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../Swap.sol";
import "../interfaces/IMasterRegistry.sol";
import "./PermissionlessSwapUtils.sol";
import "./ShareProtocolFee.sol";

/**
 * @title Swap - A StableSwap implementation in solidity.
 * @notice This contract is responsible for custody of closely pegged assets (eg. group of stablecoins)
 * and automatic market making system. Users become an LP (Liquidity Provider) by depositing their tokens
 * in desired ratios for an exchange of the pool token that represents their share of the pool.
 * Users can burn pool tokens and withdraw their share of token(s).
 *
 * Each time a swap between the pooled tokens happens, a set fee incurs which effectively gets
 * distributed to the LPs.
 *
 * In case of emergencies, admin can pause additional deposits, swaps, or single-asset withdraws - which
 * stops the ratio of the tokens in the pool from changing.
 * Users can always withdraw their tokens via multi-asset withdraws.
 *
 * @dev Most of the logic is stored as a library `SwapUtils` for the sake of reducing contract's
 * deployment size.
 */
contract PermissionlessSwap is Swap, ShareProtocolFee {
    using PermissionlessSwapUtils for SwapUtils.Swap;

    /**
     * @notice Constructor for the PermissionlessSwap contract.
     * @param _masterRegistry address of the MasterRegistry contract
     */
    constructor(IMasterRegistry _masterRegistry)
        public
        ShareProtocolFee(_masterRegistry)
    {}

    /*** ADMIN FUNCTIONS ***/

    /**
     * @notice Withdraw all admin fees to the contract owner and the fee collector
     */
    function withdrawAdminFees()
        external
        payable
        virtual
        override(Swap, ShareProtocolFee)
    {
        require(
            msg.sender == owner() || msg.sender == feeCollector,
            "Caller is not authroized"
        );
        PermissionlessSwapUtils.withdrawAdminFees(
            swapStorage,
            owner(),
            feeCollector
        );
    }
}
