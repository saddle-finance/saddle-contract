// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/ISwap.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/**
 * @title SwapMigrator
 * @notice This contract is responsible for migrating old BTC or USD pool liquidity to the new ones.
 * Users can use this contract to remove their liquidity from the old pools and add them to the new
 * ones with a single transaction.
 */
contract SwapMigrator {
    using SafeERC20 for IERC20;

    struct MigrationData {
        address oldPoolAddress;
        IERC20 oldPoolLPTokenAddress;
        address newPoolAddress;
        IERC20 newPoolLPTokenAddress;
        IERC20[] underlyingTokens;
    }

    MigrationData public btcPoolMigrationData;
    MigrationData public usdPoolMigrationData;
    address public owner;

    uint256 private constant MAX_UINT256 = 2**256 - 1;

    /**
     * @notice Sets the storage variables and approves tokens to be used by the old and new swap contracts
     * @param btcData_ MigrationData struct with information about old and new BTC pools
     * @param usdData_ MigrationData struct with information about old and new USD pools
     * @param owner_ owner that is allowed to call the `rescue()` function
     */
    constructor(
        MigrationData memory btcData_,
        MigrationData memory usdData_,
        address owner_
    ) public {
        // Approve old BTC LP Token to be used by the old BTC pool
        btcData_.oldPoolLPTokenAddress.approve(
            btcData_.oldPoolAddress,
            MAX_UINT256
        );

        // Approve BTC tokens to be used by the new BTC pool
        for (uint256 i = 0; i < btcData_.underlyingTokens.length; i++) {
            btcData_.underlyingTokens[i].safeApprove(
                btcData_.newPoolAddress,
                MAX_UINT256
            );
        }

        // Approve old USD LP Token to be used by the old USD pool
        usdData_.oldPoolLPTokenAddress.approve(
            usdData_.oldPoolAddress,
            MAX_UINT256
        );

        // Approve USD tokens to be used by the new USD pool
        for (uint256 i = 0; i < usdData_.underlyingTokens.length; i++) {
            usdData_.underlyingTokens[i].safeApprove(
                usdData_.newPoolAddress,
                MAX_UINT256
            );
        }

        // Set storage variables
        btcPoolMigrationData = btcData_;
        usdPoolMigrationData = usdData_;
        owner = owner_;
    }

    /**
     * @notice Migrates old BTC pool's LPToken to the new pool
     * @param amount Amount of old LPToken to migrate
     * @param minAmount Minimum amount of new LPToken to receive
     */
    function migrateBTCPool(uint256 amount, uint256 minAmount)
        external
        returns (uint256)
    {
        // Load struct to memory
        return _migrate(btcPoolMigrationData, amount, minAmount);
    }

    /**
     * @notice Migrates old USD pool's LPToken to the new pool
     * @param amount Amount of old LPToken to migrate
     * @param minAmount Minimum amount of new LPToken to receive
     */
    function migrateUSDPool(uint256 amount, uint256 minAmount)
        external
        returns (uint256)
    {
        // Load struct to memory
        return _migrate(usdPoolMigrationData, amount, minAmount);
    }

    function _migrate(
        MigrationData memory mData,
        uint256 amount,
        uint256 minAmount
    ) internal returns (uint256) {
        // Transfer old LP token from the caller
        mData.oldPoolLPTokenAddress.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        // Remove liquidity from the old pool and add them to the new pool
        uint256[] memory amounts =
            ISwap(mData.oldPoolAddress).removeLiquidity(
                amount,
                new uint256[](mData.underlyingTokens.length),
                MAX_UINT256
            );
        uint256 mintedAmount =
            ISwap(mData.newPoolAddress).addLiquidity(
                amounts,
                minAmount,
                MAX_UINT256
            );

        // Transfer new LP Token to the caller
        mData.newPoolLPTokenAddress.safeTransfer(msg.sender, mintedAmount);
        return mintedAmount;
    }

    /**
     * @notice Rescues any token that may be sent to this contract accidentally.
     * @param token Amount of old LPToken to migrate
     * @param to Minimum amount of new LPToken to receive
     */
    function rescue(IERC20 token, address to) external {
        require(msg.sender == owner, "is not owner");
        token.safeTransfer(to, token.balanceOf(address(this)));
    }
}
