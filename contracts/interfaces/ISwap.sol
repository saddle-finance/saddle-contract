// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./IAllowlist.sol";

interface ISwap {
    // pool data view functions
    function getA() external view returns (uint256);

    function getAPrecise() external view returns (uint256);

    function getAllowlist() external view returns (IAllowlist);

    function getToken(uint8 index) external view returns (IERC20);

    function getTokenIndex(address tokenAddress) external view returns (uint8);

    function getTokenBalance(uint8 index) external view returns (uint256);

    function getVirtualPrice() external view returns (uint256);

    function owner() external view returns (address);

    function isGuarded() external view returns (bool);

    function paused() external view returns (bool);

    function swapStorage()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            address
        );

    // min return calculation functions
    function calculateSwap(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx
    ) external view returns (uint256);

    function calculateTokenAmount(uint256[] calldata amounts, bool deposit)
        external
        view
        returns (uint256);

    function calculateRemoveLiquidity(uint256 amount)
        external
        view
        returns (uint256[] memory);

    function calculateRemoveLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256 availableTokenAmount);

    // state modifying functions
    function initialize(
        IERC20[] memory pooledTokens,
        uint8[] memory decimals,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 a,
        uint256 fee,
        uint256 adminFee,
        address lpTokenTargetAddress
    ) external;

    function swap(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    ) external returns (uint256);

    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256);

    function removeLiquidity(
        uint256 amount,
        uint256[] calldata minAmounts,
        uint256 deadline
    ) external returns (uint256[] memory);

    function removeLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount,
        uint256 deadline
    ) external returns (uint256);

    function removeLiquidityImbalance(
        uint256[] calldata amounts,
        uint256 maxBurnAmount,
        uint256 deadline
    ) external returns (uint256);
}
