// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "./Bridger.sol";

/// @notice Interface for the official Arbitrum Gateway Router contract
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

/// @notice Interface for the official Arbitrum Inbox contract
interface Inbox {
    function calculateRetryableSubmissionFee(
        uint256 _data_length,
        uint256 _base_fee
    ) external view returns (uint256);
}

/// @title Arbitrum bridger contract
/// @notice This contract is used to bridge tokens to Arbitrum
/// @dev Arbitrum bridge requires base fee for the fee calculation therefore
/// the function may revert on evm implementations that do not support base fee
contract ArbitrumBridger is Bridger {
    using SafeERC20 for IERC20;

    // SDL token address
    address private immutable SDL;
    // Arbitrum: L1 ERC20 Gateway
    address private constant ARB_GATEWAY =
        0xa3A7B6F88361F48403514059F1F16C8E78d60EeC;
    // Arbitrum: L1 Gateway Router
    address private constant ARB_GATEWAY_ROUTER =
        0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef;
    // Arbitrum: L1 Inbox
    address private constant INBOX = 0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f;

    // Submission data variable which includes gas limit and gas price
    uint256 private submissionData;
    // Mapping of token addresses to their approval status
    mapping(address => bool) public approved;

    /// @notice Event to emit when gas limit and gas price are updated
    /// @param oldSubmissionData previous submission data
    /// @param newSubmissionData new submission data
    event UpdateSubmissionData(
        uint256[2] oldSubmissionData,
        uint256[2] newSubmissionData
    );

    /// @notice Constructor for this contract
    /// @param _gasLimit The gas limit for the outbound transfer
    /// @param _gasPrice The gas price for the outbound transfer
    /// @param _SDL The address of the SDL token
    constructor(
        uint256 _gasLimit,
        uint256 _gasPrice,
        address _SDL
    ) {
        SDL = _SDL;
        // Construct submission data
        // uint128 gasLimit
        // uint128 gasPrice
        // uint256 submissionData = (gasLimit << 128) + gasPrice
        require(_gasLimit < type(uint128).max && _gasPrice < type(uint128).max);
        submissionData = (_gasLimit << 128) + _gasPrice;
        emit UpdateSubmissionData(
            [uint256(0), uint256(0)],
            [_gasLimit, _gasPrice]
        );

        // Approve SDL to be used by the associated arbitrum gateway contract
        IERC20(_SDL).safeApprove(ARB_GATEWAY, type(uint256).max);
        approved[_SDL] = true;
    }

    /// @notice Bridge tokens from the current chain to Arbitrum
    /// @dev Due to `whenNotPaused` modifier, this function can only be called when
    /// the contract is not paused. The sender must have approved this contract.
    /// @param _token address of the token to bridge
    /// @param _to address of the destination account on Arbitrum
    /// @param _amount amount of tokens to bridge
    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override whenNotPaused {
        // Transfer tokens from the caller to this
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // If the token is not SDL, approve the token transfer to appropriate gateway
        if (_token != SDL && !approved[_token]) {
            IERC20(_token).safeApprove(
                IGatewayRouter(ARB_GATEWAY_ROUTER).getGateWay(_token),
                type(uint256).max
            );
            approved[_token] = true;
        }

        // Unpack submission data
        uint256 data = submissionData;
        uint256 _gasLimit = data >> 128;
        uint256 _gasPrice = data & type(uint128).max;

        // Calculate submission cost based on current base fee
        (, uint256 calldataSize) = IGatewayRouter(ARB_GATEWAY_ROUTER)
            .getOutboundCalldata(_token, address(this), _to, _amount, "");
        uint256 submissionCost = Inbox(INBOX).calculateRetryableSubmissionFee(
            calldataSize + 256,
            block.basefee
        );

        // Use unpacked submission data and calculated submission cost to calculate
        // value to send with the outbound transfer
        address _owner = owner();
        IGatewayRouter(ARB_GATEWAY_ROUTER).outboundTransferCustomRefund{
            value: _gasLimit * _gasPrice + submissionCost
        }(
            _token,
            _owner,
            _to,
            _amount,
            _gasLimit,
            _gasPrice,
            abi.encode(submissionCost, "")
        );

        // Send any remaining ETH to the owner
        if (address(this).balance != 0) {
            payable(_owner).transfer(address(this).balance);
        }
    }

    /// @notice Check if this bridger can be used
    /// @return true if this bridger can be used
    function check(address) external pure override returns (bool) {
        return true;
    }

    /// @notice Read the stored gas limit
    /// @return gas limit to use for arbitrum outbound transfers
    function gasLimit() external view returns (uint256) {
        return submissionData >> 128;
    }

    /// @notice Read the stored gas price
    /// @return gas price to use for arbitrum outbound transfers
    function gasPrice() external view returns (uint256) {
        return submissionData & type(uint128).max;
    }

    /// @notice Calculate the total gas cost for an outbound transfer
    /// @return total gas cost for an outbound transfer
    function cost() external view override returns (uint256) {
        return cost(block.basefee);
    }

    /// @notice Calculate the total gas cost for an outbound transfer. Uses the
    /// provided base fee instead of the current base fee.
    /// @param basefee The basefee to use for the calculation
    /// @return total gas cost for an outbound transfer
    function cost(uint256 basefee) public view returns (uint256) {
        // Calculate submission cost based on current base fee
        (, uint256 calldataSize) = IGatewayRouter(ARB_GATEWAY_ROUTER)
            .getOutboundCalldata(SDL, address(this), msg.sender, 10**36, "");
        uint256 submissionCost = Inbox(INBOX).calculateRetryableSubmissionFee(
            calldataSize + 256,
            basefee
        );
        uint256 data = submissionData;
        // gasLimit * gasPrice + maxSubmissionCost
        return ((data >> 128) * (data & type(uint128).max) + submissionCost);
    }

    /// @notice Update the gas limit and gas price for outbound transfers
    /// @dev only callable by the owner
    /// @param _gasLimit gas limit to store for the outbound transfer
    /// @param _gasPrice gas price to store for the outbound transfer
    function setSubmissionData(uint256 _gasLimit, uint256 _gasPrice)
        external
        onlyOwner
    {
        // construct submission data
        require(_gasLimit < type(uint128).max && _gasPrice < type(uint128).max);
        uint256 data = submissionData;
        submissionData = (_gasLimit << 128) + _gasPrice;
        emit UpdateSubmissionData(
            [data >> 128, data & type(uint128).max],
            [_gasLimit, _gasPrice]
        );
    }
}
