// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../LPToken.sol";
import "../interfaces/ISwap.sol";
import "../interfaces/IMetaSwap.sol";

/**
 * @title SwapUtils library
 * @notice A library to be used within Swap.sol. Contains functions responsible for custody and AMM functionalities.
 * @dev Contracts relying on this library must initialize SwapUtils.Swap struct then use this library
 * for SwapUtils.Swap struct. Note that this library contains both functions called by users and admins.
 * Admin functions should be protected within contracts using this library.
 */
contract MetaSwapDeposit {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    function addLiquidity() external {}

    function removeLiquidityOneToken() external {}

    function removeLiquidityImbalance() external {}

    function calculateTokenAmount(
        address account,
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256) {
        // return swapStorage.calculateTokenAmount(account, amounts, deposit);
        return 0;
    }
}
