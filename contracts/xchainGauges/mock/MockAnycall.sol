// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface IAnyCallTranslator{
    function anyExecute(bytes calldata _data) external returns (bool success, bytes memory result);
}

contract MockAnyCall { 

    address public anyCallTranslator;

    function anyCall(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _to_chain_id
    ) external pure{
        return;
    }
    function setanyCallTranslator(address _anyCallTranslator) external {
        anyCallTranslator = _anyCallTranslator;
    }

    function callAnyExecute(address anycallTranslator, bytes calldata _data) external {
        IAnyCallTranslator(anycallTranslator).anyExecute(_data);
    }

    function context() external view returns (address from, uint256 fromChainID, uint256 nonce){
        return(anyCallTranslator, 1, 0);
    }

    function executor() external view returns (address _executor){
        return(address(this));
    }

    
}
