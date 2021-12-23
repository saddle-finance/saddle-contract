// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/ISwap.sol";
import "./helper/BaseBoringBatchable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GeneralizedSwapMigrator
 * @notice This contract is responsible for migration liquidity between pools
 * Users can use this contract to remove their liquidity from the old pools and add them to the new
 * ones with a single transaction.
 */
contract GeneralizedSwapMigrator is Ownable, BaseBoringBatchable {
    using SafeERC20 for IERC20;

    struct MigrationData {
        address newPoolAddress;
        IERC20 oldPoolLPTokenAddress;
        IERC20 newPoolLPTokenAddress;
        IERC20[] tokens;
    }

    uint256 private constant MAX_UINT256 = 2**256 - 1;
    mapping(address => MigrationData) public migrationMap;

    event AddMigrationData(address indexed oldPoolAddress, MigrationData mData);
    event Migrate(
        address indexed migrator,
        address indexed oldPoolAddress,
        uint256 oldLPTokenAmount,
        uint256 newLPTokenAmount
    );

    constructor() public Ownable() {}

    /**
     * @notice Add new migration data to the contract
     * @param oldPoolAddress pool address to migrate from
     * @param mData MigrationData struct that contains information of the old and new pools
     * @param overwrite should overwrite existing migration data
     */
    function addMigrationData(
        address oldPoolAddress,
        MigrationData memory mData,
        bool overwrite
    ) external onlyOwner {
        // Check
        if (!overwrite) {
            require(
                address(migrationMap[oldPoolAddress].oldPoolLPTokenAddress) ==
                    address(0),
                "cannot overwrite existing migration data"
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

        for (uint8 i = 0; i < 32; i++) {
            address oldPoolToken;
            try ISwap(oldPoolAddress).getToken(i) returns (IERC20 token) {
                oldPoolToken = address(token);
            } catch {
                require(i > 0, "Failed to get tokens underlying Saddle pool.");
                oldPoolToken = address(0);
            }

            try ISwap(mData.newPoolAddress).getToken(i) returns (IERC20 token) {
                require(
                    oldPoolToken == address(token) &&
                        oldPoolToken == address(mData.tokens[i]),
                    "Failed to match tokens list"
                );
            } catch {
                require(i > 0, "Failed to get tokens underlying Saddle pool.");
                require(
                    oldPoolToken == address(0) && i == mData.tokens.length,
                    "Failed to match tokens list"
                );
                break;
            }
        }

        // Effect
        migrationMap[oldPoolAddress] = mData;

        // Interaction
        // Approve old LP Token to be used for withdraws.
        mData.oldPoolLPTokenAddress.approve(oldPoolAddress, MAX_UINT256);

        // Approve underlying tokens to be used for deposits.
        for (uint256 i = 0; i < mData.tokens.length; i++) {
            mData.tokens[i].safeApprove(mData.newPoolAddress, 0);
            mData.tokens[i].safeApprove(mData.newPoolAddress, MAX_UINT256);
        }

        emit AddMigrationData(oldPoolAddress, mData);
    }

    /**
     * @notice Migrates saddle LP tokens from a pool to another
     * @param oldPoolAddress pool address to migrate from
     * @param amount amount of LP tokens to migrate
     * @param minAmount of new LP tokens to receive
     */
    function migrate(
        address oldPoolAddress,
        uint256 amount,
        uint256 minAmount
    ) external returns (uint256) {
        // Check
        MigrationData memory mData = migrationMap[oldPoolAddress];
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
            new uint256[](mData.tokens.length),
            MAX_UINT256
        );
        // Add acquired liquidity to the new pool
        uint256 mintedAmount = ISwap(mData.newPoolAddress).addLiquidity(
            amounts,
            minAmount,
            MAX_UINT256
        );

        // Transfer new LP Token to the caller
        mData.newPoolLPTokenAddress.safeTransfer(msg.sender, mintedAmount);

        emit Migrate(msg.sender, oldPoolAddress, amount, mintedAmount);
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
