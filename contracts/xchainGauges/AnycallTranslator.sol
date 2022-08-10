// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

interface ICallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        uint256 _flags
    ) external; // nonpayable

    function context() external view returns (address from, uint256 fromChainID, uint256 nonce);
    
    function executor() external view returns (address executor);
}

contract AnyCallTranslator {
    // consts
    address public owneraddress;
    address private anycallExecutor;
    address private GaugeFactory;
    address public verifiedcaller;

    // events
    event NewMsg(string msg);

    constructor(address _owner, address _anycallExecutor) {
        // Root | Child Gauge Factory
        owneraddress = _owner;
        anycallExecutor = _anycallExecutor;

    }
    
    modifier onlyowner() {
        require(msg.sender == owneraddress, "only owner can call this method");
        _;
    }

    function setAnycallImplementation(address _anycallExecutor) onlyowner external {
        anycallExecutor = _anycallExecutor;
    }

    function updateOwnership(address _newOwner) onlyowner external {
        owneraddress = _newOwner;
    }

    function anyCalls(
        address _to,
        bytes memory _data,
        address _fallback,
        uint256 _toChainId,
        // Use 0 flag to pay fee on destination chain, 1 to pay on source
        uint256 _flags
    ) onlyowner external {
        ICallProxy(anycallExecutor).anyCall(_to, _data, _fallback, _toChainId,_flags);
    }

    function anyExecute(bytes memory _data) external returns (bool success, bytes memory result){
        (string memory _msg) = abi.decode(_data, (string));  
        (address from, uint256 fromChainId,) = ICallProxy(anycallExecutor).context();
        require(anycallExecutor == from, "AnycallClient: wrong context");
        emit NewMsg(_msg);
        success=true;
        result="";

    }

    function checkContext() external view returns (address,address,uint256,uint256){
        (address from, uint256 fromChainId,uint256 nonce) = ICallProxy(anycallExecutor).context();
        return ( anycallExecutor,from, fromChainId,nonce);
    }
}