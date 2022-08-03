// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";


contract RootOracle {
    // consts
    address public callProxy;
    address public owner;
    address public futureOwner;
    address private constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;
    
    // vars
    mapping(address => Point) public userPoints;
    Point public globalPoint;

    struct Point { 
        int128 bias;
        int128 slope;
        uint256 ts;
    }

    // events 
    event TransferOwnership(address oldOwner, address newOwner);
    event UpdateCallProxy(
        address oldCallProxy,
        address newCallProxy
    );

    constructor(
        address _callProxy
    ) {
        callProxy = _callProxy;
        emit UpdateCallProxy(
            ZERO_ADDRESS,
            _callProxy
        );
        owner = msg.sender;
        emit TransferOwnership(
            ZERO_ADDRESS,
            msg.sender
        );
    }

    function balanceOf(address _user) external view returns(uint256){
        // TODO: memory or storage here? same for rest in contract 
        Point memory lastPoint = userPoints[_user];
        lastPoint.bias -= lastPoint.slope * int128(block.timestamp - lastPoint.ts);
        if(lastPoint.bias < 0 ){
            lastPoint.bias = 0;
        }
        return uint256(lastPoint.bias);
    }

    function totatlSupply() external view returns(uint256){
        Point memory lastPoint = globalPoint;
        lastPoint.bias -= lastPoint.slope * int128(block.timestamp - lastPoint.ts);
        if(lastPoint.bias < 0 ){
            lastPoint.bias = 0;
        }
        return uint256(lastPoint.bias);
    }

    function recieve(Point calldata _userPoint, Point memory _globalPoint, address _user) external {
        require(msg.sender == callProxy, "not translator");
        Point storage prevUserPoint = userPoints[_user];
        if(_userPoint > prevUserPoint){
            userPoints[_user] = _userPoint;
        }

        Point memory prevGlobalPoint = globalPoint;
        if(_globalPoint > prevGlobalPoint){
            globalPoint = _globalPoint;
        }
    }

    function setCallProxy(address _newCallProxy) external{
        require(msg.sender == owner, "not owner");
        emit UpdateCallProxy(
            callProxy,
            _newCallProxy
        );
        callProxy = _newCallProxy;
    }


    function commitTransferOwnership(address _futureOwner) external {
        require(msg.sender == owner);
        futureOwner = _futureOwner;
    }

    function acceptTransferOwnership() external {
        require(msg.sender == futureOwner);
        emit TransferOwnership(owner, msg.sender);
        owner = msg.sender;
    }
}
