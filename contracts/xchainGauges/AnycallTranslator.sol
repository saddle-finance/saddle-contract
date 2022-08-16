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
        (address _from,,) = IAnycallExecutor(anycallExecutor).context();
        // Messages should only be accepted if they are from this contract
        // ChainId check should not be neccessary as salt is private
        require(_from == address(this), "AnycallClient: wrong context");
        // TODO: function selectors will be the same for child and root, have to find another way to select how to decode
        // bytes4 selector = abi.decode(data[:4], (bytes4));
        // Decode selector to string
        
        // (string memory message) = abi.decode(data, (uint256, bytes32));
        emit NewMsg(data);
        success=true;
        result="";
        return(success, result);
    }
}
