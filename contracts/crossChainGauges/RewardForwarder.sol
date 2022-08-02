// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

interface IGauge {
    function deposit_reward_token(address _reward_token, uint256 amount)
        external
        view; // nonpayable
}

contract RewardForwarder {
    // consts
    using SafeERC20 for IERC20;
    address immutable GAUGE;
    uint256 private constant MAX_UINT256 = 2**256 - 1;

    constructor(address _gauge) {
        GAUGE = _gauge;
    }

    function depositRewardToken(address _rewardToken) external {
        //can this really be a view? Is recommened to be
        IGauge(GAUGE).deposit_reward_token(
            _rewardToken,
            IERC20(_rewardToken).balanceOf(address(this))
        );
    }

    function allow(address _rewardToken) external {
        IERC20(_rewardToken).safeApprove(GAUGE, MAX_UINT256);
    }

    function gauge() external view returns (address) {
        return (GAUGE);
    }
}
