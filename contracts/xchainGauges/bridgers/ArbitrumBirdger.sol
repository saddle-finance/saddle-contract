// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

interface IGatewayRouter {
    function getGateWay(address _token) external view returns (address);

    function outboundTransfer(
        address _token,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data // _max_submission_cost, _extra_data
    ) external payable;
}

contract ArbitrumBridger {
    // TODO: do we want setter functions for these gate_ways? 
    // Other contracts using this one have setters for what bridger to use
    
    // consts
    address private constant SDL = 0xf1Dc500FdE233A4055e25e5BbF516372BC4F6871;
    // Arbitrum: L1 ERC20 Gateway
    address private constant ARB_GATEWAY =
        0xa3A7B6F88361F48403514059F1F16C8E78d60EeC;
    address private constant ARB_GATEWAY_ROUTER =
        0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef;
    uint256 private constant MAX_UINT256 = 2**256 - 1;
    address private constant ZERO_ADDRESS =
        0x0000000000000000000000000000000000000000;
    // vars
    uint256 private gasLimit;
    uint256 private gasPrice;
    uint256 private maxSubmissionCost;

    mapping(address => bool) public approved;

    // owner
    address public owner;
    address public futureOwner;

    using SafeERC20 for IERC20;

    event TransferOwnership(address oldOwner, address newOwner);

    event UpdateSubmissionData(
        uint256[3] oldSubmissionData,
        uint256[3] newSubmissionData
    );

    constructor(
        uint256 _gasLimit,
        uint256 _gasPrice,
        uint256 _maxSubmissionCost
    ) {
        // construct submission data
        gasLimit = _gasLimit;
        gasPrice = _gasPrice;
        maxSubmissionCost = _maxSubmissionCost;
        emit UpdateSubmissionData(
            [uint256(0), uint256(0), uint256(0)],
            [gasLimit, gasLimit, maxSubmissionCost]
        );

        // approve token transfer to gateway
        IERC20 sdlToken = IERC20(SDL);
        // TODO: doesn't allow for safeApprove?
        assert(sdlToken.approve(ARB_GATEWAY, MAX_UINT256));
        approved[SDL] = true;
        owner = msg.sender;
        emit TransferOwnership(ZERO_ADDRESS, msg.sender);
    }

    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable {
        // TODO: doesn't allow for safeTransferFrom?
        assert(IERC20(_token).transferFrom(msg.sender, address(this), _amount));
        if (_token != SDL && !approved[_token]) {
            // TODO: doesn't allow for safeApprove?
            assert(
                IERC20(_token).approve(
                    IGatewayRouter(ARB_GATEWAY_ROUTER).getGateWay(SDL),
                    MAX_UINT256
                )
            );
            approved[_token] = true;
        }
        IGatewayRouter(ARB_GATEWAY_ROUTER).outboundTransfer{
            value: gasLimit * gasPrice + maxSubmissionCost
        }(
            _token,
            _to,
            _amount,
            gasLimit,
            gasPrice,
            abi.encode(maxSubmissionCost, new bytes(0))
        );
    }

    function cost() external view returns (uint256) {
        // gasLimit * gasPrice + maxSubmissionCost
        return (gasLimit * gasPrice + maxSubmissionCost);
    }

    function setSubmissionData(
        uint256 _gasLimit,
        uint256 _gasPrice,
        uint256 _maxSubmissionCost
    ) external {
        require(msg.sender == owner, "error msg");
        emit UpdateSubmissionData(
            [gasLimit, gasPrice, maxSubmissionCost],
            [_gasLimit, _gasPrice, _maxSubmissionCost]
        );
        gasLimit = _gasLimit;
        gasPrice = _gasPrice;
        maxSubmissionCost = _maxSubmissionCost;
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