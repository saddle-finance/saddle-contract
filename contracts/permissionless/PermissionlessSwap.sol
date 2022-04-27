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
 * distributed to the LPs. Part of this fee is given to the creator of the pool as an Admin fee,
 * the amount of which is set when the pool is created. Saddle will collect to 50% of these Admin fees.
 *
 * In case of emergencies, admin can pause additional deposits, swaps, or single-asset withdraws - which
 * stops the ratio of the tokens in the pool from changing.
 * Users can always withdraw their tokens via multi-asset withdraws.
 *
 * @dev Most of the logic is stored as a library `PermissionlessSwapUtils` for the sake of reducing
 * contract's deployment size.
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
     * @notice Updates cached address of the fee collector
     */
    function initialize(
        IERC20[] memory _pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress
    ) public payable virtual override initializer {
        Swap.initialize(
            _pooledTokens,
            decimals,
            lpTokenName,
            lpTokenSymbol,
            _a,
            _fee,
            _adminFee,
            lpTokenTargetAddress
        );
        _updateFeeCollectorCache(MASTER_REGISTRY);
    }

    /**
     * @notice Withdraw all admin fees to the contract owner and the fee collector.
     */
    function withdrawAdminFees()
        external
        payable
        virtual
        override(Swap, ShareProtocolFee)
    {
        require(
            msg.sender == owner() || msg.sender == feeCollector,
            "Caller is not authorized"
        );
        PermissionlessSwapUtils.withdrawAdminFees(
            swapStorage,
            owner(),
            feeCollector
        );
    }
}
