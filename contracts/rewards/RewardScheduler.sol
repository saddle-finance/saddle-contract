// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";

// POC of a reward scheduler contract that can schedule N weeks worth of rewards
// This contract is only a proof of concept and should not be used in production as is
contract RewardScheduler {
    using SafeERC20 for IERC20;

    address public rewardToken;
    uint256 public lastTimestamp;
    uint256 public numOfWeeksLeft;
    uint256 public amountPerWeek;

    address public immutable rewardForwarder;

    event RewardScheduled(
        address indexed rewardToken,
        uint256 amountPerWeek,
        uint256 numOfWeeks
    );

    constructor(address _rewardForwader) {
        require(_rewardForwader != address(0), "RewardScheduler: zero address");
        rewardForwarder = _rewardForwader;
    }

    function scheduleReward(
        address _rewardToken,
        uint256 _amount,
        uint256 numberOfWeeks
    ) external {
        require(
            numOfWeeksLeft == 0,
            "RewardScheduler: reward already scheduled"
        );
        require(
            _rewardToken != address(0),
            "RewardScheduler: zero address reward token"
        );
        uint256 _amountPerWeek = _amount / numberOfWeeks;
        require(_amountPerWeek > 0, "RewardScheduler: amount too small");

        rewardToken = _rewardToken;
        lastTimestamp = block.timestamp;
        numOfWeeksLeft = numberOfWeeks;
        amountPerWeek = _amountPerWeek;

        IERC20(_rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        emit RewardScheduled(_rewardToken, _amountPerWeek, numberOfWeeks);

        _transferReward();
    }

    function _transferReward() internal {
        numOfWeeksLeft -= 1;
        lastTimestamp = block.timestamp;

        IERC20(rewardToken).safeTransfer(rewardForwarder, amountPerWeek);
    }

    function transferReward() external {
        require(numOfWeeksLeft > 0, "RewardScheduler: no reward scheduled");
        require(
            block.timestamp - lastTimestamp >= 1 weeks,
            "RewardScheduler: not enough time has passed"
        );

        _transferReward();
    }
}
