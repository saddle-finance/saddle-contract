// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

import "./ISwap.sol";

interface ISwapFlashLoan is ISwap {
    function flashLoan(
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes memory params
    ) external;
}
