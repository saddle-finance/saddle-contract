// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface IAnyCallTranslator{
    function anyExecute(
        bytes memory _data
    ) external;
}

contract MockAnyCall {

    constructor( address _from, uint256 _fromChainID, uint256 _nonce
    ) {
        address public from = _from;
        uint256 public fromChainID = _fromChainID;
        uint256 public nonce = _nonce;
    }

    function anyCall(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _to_chain_id
    ) external pure{
        return;
    }

    function callAnyExecute(address anycallTranslator, bytes calldata _data) external {
        IAnyCallTranslator(anycallTranslator).anyExecute(_data);
    }

    function context() external view returns (address from, uint256 fromChainID, uint256 nonce){
        return(from, fromChainID, nonce);
    }

    
}