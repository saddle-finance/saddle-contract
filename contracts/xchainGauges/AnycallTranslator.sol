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
    
    function executor() external view returns (address executor);
}

interface IAnycallExecutor {
    function context() external view returns (address from, uint256 fromChainID, uint256 nonce);
}

interface IGaugeFactory {
    function deployGauge (address _lp_token,bytes32 _salt,address _manager) external returns(address);
    
    function executor() external view returns (address executor);
}

contract AnyCallTranslator {
    // consts
    address public owneraddress;
    bytes public dataResult;
    string public selector;
    // TODO: maybe dont need to save this var
    address private anycallExecutor;
    address private anycallContract;
    address private GaugeFactory;
    address public verifiedcaller;

    // events
    event NewMsg(bytes msg);

    constructor(address _owner, address _anycallContract) {
        // Root | Child Gauge Factory
        owneraddress = _owner;
        anycallExecutor=ICallProxy(_anycallContract).executor();

    }
    
    modifier onlyowner() {
        require(msg.sender == owneraddress, "only owner can call this method");
        _;
    }

    function setAnycallImplementation(address _anycallContract) external onlyowner {
        anycallContract = _anycallContract;
    }

    function updateOwnership(address _newOwner) external onlyowner {
        owneraddress = _newOwner;
    }

    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        // Use 0 flag to pay fee on destination chain, 1 to pay on source
        uint256 _flags
    ) external  onlyowner {
        ICallProxy(anycallContract).anyCall(_to, _data, _fallback, _toChainId,_flags);
    }

    function anyExecute(bytes calldata data) external returns (bool success, bytes memory result){  
        // Get address of anycallExecutor
        (address _from,,) = IAnycallExecutor(anycallExecutor).context();
        // Check that caller is verified
        require(_from == address(this), "AnycallClient: wrong context");
        // Pass encoded function call to gauge factory
        (success, result) = GaugeFactory.call(data);
        return(success, result);
    }
}
