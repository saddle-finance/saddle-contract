// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

interface ICallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        uint256 _flags
    ) external; // nonpayable

    function deposit(address _account) external payable;
    
    function executor() external view returns (address executor);
}

interface IAnycallExecutor {
    function context() external view returns (address from, uint256 fromChainID, uint256 nonce);
}


contract AnyCallTranslator {
    using SafeERC20 for IERC20;
    // consts
    address public owneraddress;
    bytes public dataResult;
    // TODO: maybe dont need to save this var
    address private anycallExecutor;
    address private anycallContract;
    address private oracleContract;
    address private gaugeFactory;
    address public verifiedcaller;

    // events
    event NewMsg(bytes msg);

    constructor(address _owner, address _anycallContract) {
        // Root | Child Gauge Factory
        owneraddress = _owner;
        anycallExecutor=ICallProxy(_anycallContract).executor();

    }
    
    modifier onlyOwner() {
        require(msg.sender == owneraddress, "only owner can call this method");
        _;
    }

    function setAnycallImplementation(address _anycallContract) external onlyOwner {
        anycallContract = _anycallContract;
    }

    function setOracle(address _oracleContract) external onlyOwner {
        oracleContract = _oracleContract;
    }

    function setGaugeFactory(address _gaugeFactory) external onlyOwner {
        gaugeFactory = _gaugeFactory;
    }

    function updateOwnership(address _newOwner) external onlyOwner {
        owneraddress = _newOwner;
    }

    function deposit(address _account) external payable {
        ICallProxy(anycallContract).deposit(_account);
    }

    function rescue(IERC20 token, address to) external onlyOwner {
        token.safeTransfer(to, token.balanceOf(address(this)));
    }
    
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        // Use 0 flag to pay fee on destination chain, 1 to pay on source
        uint256 _flags
    ) external payable onlyOwner {
        ICallProxy(anycallContract).anyCall(_to, _data, _fallback, _toChainId,_flags);
    }

    function anyExecute(bytes calldata data) external returns (bool , bytes memory ){  
        // Get address of anycallExecutor
        (address _from,,) = IAnycallExecutor(anycallExecutor).context();
        // Check that caller is verified
        require(_from == address(this), "AnycallClient: wrong context");
        
        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        if (selector == 0xe10a16b8) { // deploy_gauge(uint256,bytes32)
            // Root Gauge Facotry call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
             // Pass encoded function call to gauge factory, require ensures that the call is successful
            (bool success, bytes memory returnedData) = gaugeFactory.call(data);
            require(success, "Root Gauge Deploy Execution Failed");
            return (success, returnedData);
        }
        else if (selector == 0x6be320d2) { // "deploy_gauge(address, bytes32, address)"
            // Child Gauge Facotry call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
             // Pass encoded function call to gauge factory, require ensures that the call is successful
            (bool success, bytes memory returnedData) = gaugeFactory.call(data);
            require(success, "Child Gauge Deploy Execution Failed");
            return (success, returnedData);
        }
        else if (selector == 0xc80fbe4e) { // "push(uint256 _chainId, address _user)"
            // Oracle Push Call
            // 0x0 is the selector for the fallback function
            // Fallback function is not implemented
            (bool success, bytes memory returnedData) = oracleContract.call(data);
            require(success, "Oracle Push Execution Failed");
            return (success, returnedData);
        }
        else {
            revert("Unknown selector");
        }
        
    }
}
