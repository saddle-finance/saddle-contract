// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IGauge.sol";

/// @title GaugeTokenHolder contract
/// @notice GaugeTokenHolder contract allows the itself to claims tokens
/// from the associated Minter contract. Optionally allows forwarding the
/// reward token to another contract.

interface IMinterLike {
    function mint(address gauge) external;
}

abstract contract GaugeTokenHolder {
    using SafeERC20 for IERC20;
    address public rewardReceiver;
    address public gaugeToken;
    address public rewardToken;
    address public minter;

    /// @notice Emitted when the reward token is claimed
    /// @param amount Amount of reward token claimed
    event Claimed(uint256 amount);

    /// @notice Emitted when the reward token is forwarded
    /// @param dest Destination address
    /// @param amount Amount of reward token forwarded
    event Forwarded(address dest, uint256 amount);

    /// @notice Emitted when the reward receiver is changed
    /// @param oldRewardReceiver Old reward receiver address
    /// @param newRewardReceiver New reward receiver address
    event RewardReceiverUpdated(
        address oldRewardReceiver,
        address newRewardReceiver
    );

    function _initialize(address gauge) internal {
        require(gauge != address(0), "gauge address cannot be 0");
        require(gaugeToken == address(0), "already initialized");
        gaugeToken = gauge;
        rewardToken = IGauge(gauge).SDL();
        minter = IGauge(gauge).FACTORY();
    }

    /// @notice Claim the reward token from the associated Minter contract.
    /// If a rewardReceiver is set, the reward token is forwarded to the
    /// rewardReceiver. Otherwise, the reward token is kept.
    function _claim() internal {
        address _gaugeToken = gaugeToken;
        require(_gaugeToken != address(0), "gaugeToken address not set");

        address _rewardToken = rewardToken;
        address _minter = minter;

        // Claim SDL. Amount is based on balance of the gauge token held by this
        IMinterLike(_minter).mint(gaugeToken);
        uint256 amount = IERC20(_rewardToken).balanceOf(address(this));
        emit Claimed(amount);

        // If a rewardReceiver is set, forward the reward token to the rewardReceiver
        address _rewardReceiver = rewardReceiver;
        if (_rewardReceiver != address(0)) {
            IERC20(_rewardToken).safeTransfer(_rewardReceiver, amount);
            emit Forwarded(_rewardReceiver, amount);
        }
    }

    /// @notice Claim the reward token from the associated Minter contract.
    /// If a rewardReceiver is set, the reward token is forwarded to the
    /// rewardReceiver. Otherwise, the reward token is kept.
    function claimGaugeRewards() public virtual {
        _claim();
    }

    function _setRewardReceiver(address _rewardReceiver) internal {
        address oldRewardReceiver = rewardReceiver;
        rewardReceiver = _rewardReceiver;
        emit RewardReceiverUpdated(oldRewardReceiver, _rewardReceiver);

        // Set reward receiver for the gauge's third party rewards as well
        IGauge(gaugeToken).set_rewards_receiver(_rewardReceiver);
    }
}
