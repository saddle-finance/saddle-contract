// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface IAnyCallTranslator{
    function anyExecute(
        bytes memory _data
    ) external;
}

contract MockAnyCall {

    function anyCall(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _toChainId
    ) external pure{
        return;
    }

    function callAnyExecute(address anycallTranslator, bytes calldata _data) external {
        IAnyCallTranslator(anycallTranslator).anyExecute(_data);
    }

    
}