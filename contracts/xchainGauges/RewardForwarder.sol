// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";

/// @notice interface compatible with LiquidityGaugeV5 or ChildGauge
interface IGauge {
    function deposit_reward_token(address _reward_token, uint256 amount)
        external; // nonpayable
}

/// @title RewardForwarder contract for gauges
/// @notice RewardForwarder is responsible for forwarding rewards to gauges
/// in permissionlessly manner
contract RewardForwarder {
    using SafeERC20 for IERC20;

    // address of the associated gauge
    address immutable GAUGE;

    /// @notice RewardForwarder constructor. Sets the gauge address.
    /// @param _gauge address of the associated gauge
    constructor(address _gauge) {
        GAUGE = _gauge;
    }

    /// @notice Deposit the reward token in this contract to the gauge
    /// @dev Upon calling this function, the reward token will be
    /// transferred from this contract to the gauge.
    /// @param _rewardToken address of the reward token to deposit
    function depositRewardToken(address _rewardToken) external {
        IGauge(GAUGE).deposit_reward_token(
            _rewardToken,
            IERC20(_rewardToken).balanceOf(address(this))
        );
    }

    /// @notice Allow the gauge to use the reward token in this contract
    /// @dev This must be called before `depositRewardToken` can be called successfully
    /// @param _rewardToken address of the reward token to deposit
    function allow(address _rewardToken) external {
        IERC20(_rewardToken).safeApprove(GAUGE, 0);
        IERC20(_rewardToken).safeApprove(GAUGE, type(uint256).max);
    }

    /// @notice Read the associated gauge address
    /// @return gauge address
    function gauge() external view returns (address) {
        return (GAUGE);
    }
}
