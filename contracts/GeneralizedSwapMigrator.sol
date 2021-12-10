// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/ISwap.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GeneralizedSwapMigrator
 * @notice This contract is responsible for migration liquidity between pools
 * Users can use this contract to remove their liquidity from the old pools and add them to the new
 * ones with a single transaction.
 */
contract GeneralizedSwapMigrator is Ownable {
    using SafeERC20 for IERC20;

    struct MigrationData {
        IERC20 oldPoolLPTokenAddress;
        IERC20 newPoolLPTokenAddress;
        IERC20[] underlyingTokens;
    }

    uint256 private constant MAX_UINT256 = 2**256 - 1;
    mapping(address => mapping(address => MigrationData)) migrationMap;

    constructor() public Ownable() {}

    /**
     * @notice Add new migration data to the contract
     * @param oldPoolAddress pool address to migrate from
     * @param newPoolAddress pool address to migrate to
     * @param mData MigrationData struct that contains information of the old and new pools
     * @param overwrite should overwrite existing migration data
     */
    function addMigrationData(
        address oldPoolAddress,
        address newPoolAddress,
        MigrationData memory mData,
        bool overwrite
    ) external onlyOwner {
        // Check
        if (!overwrite) {
            require(
                address(
                    migrationMap[oldPoolAddress][newPoolAddress]
                        .oldPoolLPTokenAddress
                ) != address(0),
                "cannot overwrite migrationData"
            );
        }
        require(
            address(mData.oldPoolLPTokenAddress) != address(0),
            "oldPoolLPTokenAddress == 0"
        );
        require(
            address(mData.newPoolLPTokenAddress) != address(0),
            "newPoolLPTokenAddress == 0"
        );

        // Effect
        migrationMap[oldPoolAddress][newPoolAddress] = mData;

        // Interaction
        // Approve old USD LP Token to be used by the old USD pool
        mData.oldPoolLPTokenAddress.safeApprove(oldPoolAddress, MAX_UINT256);

        // Approve USD tokens to be used by the new USD pool
        for (uint256 i = 0; i < mData.underlyingTokens.length; i++) {
            mData.underlyingTokens[i].safeApprove(newPoolAddress, MAX_UINT256);
        }
    }

    /**
     * @notice Migrates saddle LP tokens from a pool to another
     * @param oldPoolAddress pool address to migrate from
     * @param newPoolAddress pool address to migrate to
     * @param amount amount of LP tokens to migrate
     * @param minAmount of new LP tokens to receive
     */
    function migrate(
        address oldPoolAddress,
        address newPoolAddress,
        uint256 amount,
        uint256 minAmount
    ) external returns (uint256) {
        // Check
        MigrationData memory mData = migrationMap[oldPoolAddress][
            newPoolAddress
        ];
        require(
            address(mData.oldPoolLPTokenAddress) != address(0),
            "migration is not available"
        );

        // Interactions
        // Transfer old LP token from the caller
        mData.oldPoolLPTokenAddress.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        // Remove liquidity from the old pool
        uint256[] memory amounts = ISwap(oldPoolAddress).removeLiquidity(
            amount,
            new uint256[](mData.underlyingTokens.length),
            MAX_UINT256
        );
        // Add acquired liquidity to the new pool
        uint256 mintedAmount = ISwap(newPoolAddress).addLiquidity(
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
    function rescue(IERC20 token, address to) external onlyOwner {
        token.safeTransfer(to, token.balanceOf(address(this)));
    }
}
