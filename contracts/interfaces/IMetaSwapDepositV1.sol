// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-4.7.3/token/ERC20/ERC20.sol";
import "./ISwapV2.sol";
import "./IMetaSwapV1.sol";

interface IMetaSwapDepositV1 {
    function initialize(
        ISwapV2 _baseSwap,
        IMetaSwapV1 _metaSwap,
        IERC20 _metaLPToken
    ) external;
}
