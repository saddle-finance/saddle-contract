// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

struct Point {
    int128 bias;
    int128 slope;
    uint256 ts;
}

interface ICallProxy {
    function anyCall(
        address _to,
        bytes calldata _data,
        address _fallback,
        uint256 _toChainId,
        uint256 _flags
    ) external; // TODO: nonpayable but doesn't let me
}

interface Factory {
    function get_bridger(uint256 _chain_id) external view returns (address);
}

interface votingEscrow {
    function epoch() external view returns (uint256);

    function point_history(uint256 _idx) external view returns (Point memory);

    function user_point_epoch(address _user) external view returns (uint256);

    function user_point_history(address _user, uint256 _idx)
        external
        view
        returns (Point memory);
}

contract RootOracle {
    // consts
    address FACTORY;
    address VE;
    address private constant ZERO_ADDRESS =
        0x0000000000000000000000000000000000000000;

    // events
    event TransferOwnership(address oldOwner, address newOwner);
    event UpdateCallProxy(address oldCallProxy, address newCallProxy);

    // vars
    address public callProxy;
    address public owner;
    address public futureOwner;

    constructor(
        address _factory,
        address _ve,
        address _callProxy
    ) {
        FACTORY = _factory;
        VE = _ve;

        callProxy = _callProxy;
        emit UpdateCallProxy(ZERO_ADDRESS, _callProxy);

        owner = msg.sender;
        emit TransferOwnership(ZERO_ADDRESS, msg.sender);
    }

    function push(uint256 _chainId) external {
        address user = msg.sender;
        assert(Factory(FACTORY).get_bridger(_chainId) != ZERO_ADDRESS);

        require(IERC20(VE).balanceOf(user) != 0, "no ve balance");
        Point memory userPoint = votingEscrow(VE).user_point_history(
            user,
            votingEscrow(VE).user_point_epoch(user)
        );
        Point memory globalPoint = votingEscrow(VE).point_history(
            votingEscrow(VE).epoch()
        );
        ICallProxy(callProxy).anyCall(
            address(this),
            abi.encodeWithSelector(
                bytes4(
                    keccak256(
                        "recieve((int128,int128,uint256),(int128,int128,uint256),address)"
                    )
                ),
                userPoint,
                globalPoint,
                user
            ),
            ZERO_ADDRESS,
            _chainId,
            0
        );
    }

    function push(uint256 _chainId, address _user) external {
        assert(Factory(FACTORY).get_bridger(_chainId) != ZERO_ADDRESS);
        require(IERC20(VE).balanceOf(_user) != 0, "no ve balance");
        Point memory userPoint = votingEscrow(VE).user_point_history(
            _user,
            votingEscrow(VE).user_point_epoch(_user)
        );
        Point memory globalPoint = votingEscrow(VE).point_history(
            votingEscrow(VE).epoch()
        );
        ICallProxy(callProxy).anyCall(
            address(this),
            abi.encode(userPoint, globalPoint, _user),
            ZERO_ADDRESS,
            _chainId,
            0
        );
    }

    function setCallProxy(address _newCallProxy) external {
        require(msg.sender == owner, "not owner");
        emit UpdateCallProxy(callProxy, _newCallProxy);
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
