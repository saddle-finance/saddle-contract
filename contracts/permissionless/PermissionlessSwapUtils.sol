// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../SwapUtils.sol";

/**
 * @title PermissionlessSwapUtils library
 * @notice A library to be used within Swap.sol. Contains functions responsible for custody and AMM functionalities.
 * @dev Contracts relying on this library must initialize SwapUtils.Swap struct then use this library
 * for SwapUtils.Swap struct. Note that this library contains both functions called by users and admins.
 * Admin functions should be protected within contracts using this library.
 */
library PermissionlessSwapUtils {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /**
     * @notice Withdraw all admin fees to two addresses evenly
     * @param self Swap struct to withdraw fees from
     * @param creator Address to send hald of the fees to. For the creator of the community pool.
     * @param protocol Address to send the half of the fees to. For the protocol fee collection.
     */
    function withdrawAdminFees(
        SwapUtils.Swap storage self,
        address creator,
        address protocol
    ) internal {
        IERC20[] memory pooledTokens = self.pooledTokens;
        for (uint256 i = 0; i < pooledTokens.length; i++) {
            IERC20 token = pooledTokens[i];
            uint256 balance = token.balanceOf(address(this)).sub(
                self.balances[i]
            ) / 2;
            if (balance != 0) {
                token.safeTransfer(creator, balance);
                token.safeTransfer(protocol, balance);
            }
        }
    }
}
