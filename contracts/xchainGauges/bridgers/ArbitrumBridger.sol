// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";

interface IGatewayRouter {
    function getGateWay(address _token) external view returns (address);

    function outboundTransferCustomRefund(
        address _l1Token,
        address _refundTo,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable;

    function getOutboundCalldata(
        address _token,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _data
    ) external view returns (uint256, uint256);
}

interface Inbox {
    function calculateRetryableSubmissionFee(
        uint256 _data_length,
        uint256 _base_fee
    ) external view returns (uint256);
}

contract ArbitrumBridger {
    using SafeERC20 for IERC20;

    // consts
    address private SDL;
    // Arbitrum: L1 ERC20 Gateway
    address private constant ARB_GATEWAY =
        0xa3A7B6F88361F48403514059F1F16C8E78d60EeC;
    address private constant ARB_GATEWAY_ROUTER =
        0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef;
    address private constant INBOX = 0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f;

    // vars
    uint256 private submissionData;
    mapping(address => bool) public approved;
    address public owner;
    address public futureOwner;

    event TransferOwnership(address oldOwner, address newOwner);
    event UpdateSubmissionData(
        uint256[2] oldSubmissionData,
        uint256[2] newSubmissionData
    );

    constructor(
        uint256 _gasLimit,
        uint256 _gasPrice,
        address _SDL
    ) {
        SDL = _SDL;
        // construct submission data
        require(_gasLimit < type(uint128).max && _gasPrice < type(uint128).max);
        submissionData = (_gasLimit << 128) + _gasPrice;
        emit UpdateSubmissionData(
            [uint256(0), uint256(0)],
            [_gasLimit, _gasPrice]
        );

        // approve token transfer to gateway
        IERC20 sdlToken = IERC20(_SDL);
        sdlToken.safeApprove(ARB_GATEWAY, type(uint256).max);
        approved[_SDL] = true;

        // update owner
        owner = msg.sender;
        emit TransferOwnership(address(0), msg.sender);
    }

    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        if (_token != SDL && !approved[_token]) {
            IERC20(_token).safeApprove(
                IGatewayRouter(ARB_GATEWAY_ROUTER).getGateWay(_token),
                type(uint256).max
            );
            approved[_token] = true;
        }

        uint256 gasLimit = submissionData >> 128;
        uint256 gasPrice = submissionData & type(uint128).max;
        uint256 outboundCalldata;
        (, outboundCalldata) = IGatewayRouter(ARB_GATEWAY_ROUTER)
            .getOutboundCalldata(_token, address(this), _to, _amount, "");
        uint256 submissionCost = Inbox(INBOX).calculateRetryableSubmissionFee(
            outboundCalldata + 256,
            block.basefee
        );

        IGatewayRouter(ARB_GATEWAY_ROUTER).outboundTransferCustomRefund{
            value: gasLimit * gasPrice + submissionCost
        }(
            _token,
            owner,
            _to,
            _amount,
            gasLimit,
            gasPrice,
            abi.encode(submissionCost, "")
        );

        // Send any remaining ETH to the owner
        if (address(this).balance != 0) {
            payable(owner).transfer(address(this).balance);
        }
    }

    function cost() external view returns (uint256) {
        return cost(block.basefee);
    }

    function cost(uint256 basefee) public view returns (uint256) {
        // gasLimit * gasPrice + maxSubmissionCost
        uint256 outboundCalldata;
        (, outboundCalldata) = IGatewayRouter(ARB_GATEWAY_ROUTER)
            .getOutboundCalldata(SDL, address(this), msg.sender, 10**36, "");
        uint256 submissionCost = Inbox(INBOX).calculateRetryableSubmissionFee(
            outboundCalldata + 256,
            basefee
        );
        uint256 data = submissionData;
        return ((data >> 128) * (data & type(uint128).max) + submissionCost);
    }

    function setSubmissionData(uint256 _gasLimit, uint256 _gasPrice) external {
        require(msg.sender == owner, "error msg");
        // construct submission data
        require(_gasLimit < type(uint128).max && _gasPrice < type(uint128).max);
        uint256 data = submissionData;
        submissionData = (_gasLimit << 128) + _gasPrice;
        emit UpdateSubmissionData(
            [data >> 128, data & type(uint128).max],
            [_gasLimit, _gasPrice]
        );
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
