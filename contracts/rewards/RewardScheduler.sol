// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-4.7.3/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-4.7.3/access/Ownable.sol";
import "@openzeppelin/contracts-4.7.3/security/ReentrancyGuard.sol";
import "../xchainGauges/RewardForwarder.sol";

// POC of a reward scheduler contract that can schedule N weeks worth of rewards
// This contract is only a proof of concept and should not be used in production as is
contract RewardScheduler is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // state variables
    uint256 public lastTimestamp;
    uint256 public numOfWeeksLeft;
    uint256 public amountPerWeek;

    // immutable variables set at construction
    address public immutable rewardForwarder;
    address public immutable rewardToken;

    /**
     * @notice Emitted when a reward is scheduled
     * @param rewardToken address of the reward token
     * @param amountPerWeek amount of reward tokens to be distributed per week
     * @param numOfWeeks number of weeks the reward is scheduled for
     */
    event RewardScheduled(
        address rewardToken,
        uint256 amountPerWeek,
        uint256 numOfWeeks
    );

    /**
     * @notice RewardScheduler constructor
     * @param _rewardForwader address of the reward forwarder contract
     */
    constructor(address _rewardForwader, address _rewardToken) {
        require(_rewardForwader != address(0), "RewardScheduler: zero address");
        require(_rewardToken != address(0), "RewardScheduler: zero address");
        rewardForwarder = _rewardForwader;
        rewardToken = _rewardToken;
    }

    /**
     * @notice Schedule a reward for N weeks
     * @dev This function will transfer the reward tokens from the caller to this contract
     * @dev This function can only be called by the owner
     * @param _amount amount of reward tokens to schedule
     * @param numberOfWeeks number of weeks to schedule the reward for
     * @param shouldTriggerDeposit whether to trigger the depositRewardToken function on the reward forwarder
     */
    function scheduleReward(
        uint256 _amount,
        uint256 numberOfWeeks,
        bool shouldTriggerDeposit
    ) external onlyOwner nonReentrant {
        // Check parameters and state
        require(
            numOfWeeksLeft == 0,
            "RewardScheduler: reward already scheduled"
        );
        uint256 _amountPerWeek = _amount / numberOfWeeks;
        require(_amountPerWeek > 0, "RewardScheduler: amount too small");

        // Update state
        numOfWeeksLeft = numberOfWeeks;
        amountPerWeek = _amountPerWeek;

        // Transfer reward tokens to this contract
        address _rewardToken = rewardToken;
        IERC20(_rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        // Trigger event
        emit RewardScheduled(_rewardToken, _amountPerWeek, numberOfWeeks);

        // Transfer reward to the reward forwarder
        // Trigger depositRewardToken on the reward forwarder if needed
        _transferReward(shouldTriggerDeposit);
    }

    function _transferReward(bool shouldTriggerDeposit) internal {
        uint256 _numOfWeeksLeft = numOfWeeksLeft;
        require(_numOfWeeksLeft > 0, "RewardScheduler: no reward scheduled");
        require(
            block.timestamp - lastTimestamp >= 1 weeks,
            "RewardScheduler: not enough time has passed"
        );

        numOfWeeksLeft = _numOfWeeksLeft - 1;
        lastTimestamp = block.timestamp;

        IERC20(rewardToken).safeTransfer(
            address(rewardForwarder),
            amountPerWeek
        );

        if (shouldTriggerDeposit) _triggerdepositRewardToken();
    }

    function _triggerdepositRewardToken() internal {
        RewardForwarder(rewardForwarder).depositRewardToken(rewardToken);
    }

    /**
     * @notice Transfer the reward to the reward forwarder. Reward must be scheduled first
     * or this function will revert. Can only be called weekly.
     * @dev This function can be called by anyone
     * @param shouldTriggerDeposit whether to trigger the depositRewardToken function on the reward forwarder
     * If set to true, rewards will start immediately. If set to false, rewards will start whenever
     * depositRewardToken is called on the reward forwarder
     */
    function transferReward(bool shouldTriggerDeposit) external nonReentrant {
        _transferReward(shouldTriggerDeposit);
    }

    /**
     * @notice Cancel any scheduled reward
     * @dev This function can only be called by the owner
     * @dev This function will transfer the remaining reward tokens back to the owner
     */
    function cancelReward() external onlyOwner nonReentrant {
        // Reset the state to allow scheduling a new reward
        numOfWeeksLeft = 0;
        amountPerWeek = 0;
        lastTimestamp = 0;

        // Transfer the remaining reward tokens back to the owner
        address _rewardToken = rewardToken;
        uint256 currentBalance = IERC20(_rewardToken).balanceOf(address(this));
        if (currentBalance > 0) {
            IERC20(_rewardToken).safeTransfer(msg.sender, currentBalance);
        }
    }
}
