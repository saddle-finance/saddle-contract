// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./ISwap.sol";
import "./IMetaSwap.sol";

interface IMetaSwapDeposit {
    function initialize(
        ISwap _baseSwap,
        IMetaSwap _metaSwap,
        IERC20 _metaLPToken
    ) external;
}
