// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../../forge-script/TestWithConstants.sol";
import "../../contracts/rewards/RewardScheduler.sol";
import "../../contracts/xchainGauges/RewardForwarder.sol";

interface IChildGaugeLike {
    function add_reward(address _reward_token, address _reward_distributor)
        external;

    function manager() external view returns (address);

    function deposit(
        uint256 _value,
        address _user,
        bool _claim_rewards
    ) external;

    function reward_data(address _reward_token)
        external
        view
        returns (
            address distributor,
            uint256 periodFinish,
            uint256 rate,
            uint256 lastUpdate,
            uint256 integral
        );

    function claim_rewards() external;
}

contract RewardSchedulerTest is TestWithConstants {
    // Existing contracts
    address public rewardToken;
    address public gauge;
    address public lpToken;

    // Deployed at setup
    address public rewardForwarder;
    address public rewardScheduler;

    function setUp() public override {
        super.setUp();
        // Fork arbitrum at block 61248913, (Feb-15-2023 08:26:16 PM +UTC)
        vm.createSelectFork("arbitrum_mainnet", 61248913);

        // Read addresses from deployment jsons
        rewardToken = getDeploymentAddress("SPA");
        gauge = getDeploymentAddress(
            "ChildGauge_SaddleFRAXUSDsMetaPoolLPToken"
        );
        lpToken = getDeploymentAddress("SaddleFRAXUSDsMetaPoolLPToken");

        // Deploy reward forwarder and reward scheduler
        vm.startPrank(DEPLOYER);
        rewardForwarder = address(new RewardForwarder(gauge));
        rewardScheduler = address(
            new RewardScheduler(rewardForwarder, rewardToken)
        );
        RewardScheduler(rewardScheduler).transferOwnership(TEST_ACCOUNT);
        vm.stopPrank();

        // Pretend to be the gauge manager and add a new external reward
        vm.prank(IChildGaugeLike(gauge).manager());
        IChildGaugeLike(gauge).add_reward(rewardToken, rewardForwarder);

        // Deal some tokens to TEST_ACCOUNT
        deal(rewardToken, TEST_ACCOUNT, 10000 * 1e18);
        deal(lpToken, TEST_ACCOUNT, 10000 * 1e18);

        // Allow rewardForwarder to use rewardToken
        vm.prank(TEST_ACCOUNT);
        RewardForwarder(rewardForwarder).allow(rewardToken);
    }

    function test_scheduleReward() public {
        vm.startPrank(TEST_ACCOUNT);

        // Make lp token deposits before external rewards are added
        // for testing purposes
        IERC20(lpToken).approve(gauge, type(uint256).max);
        IChildGaugeLike(gauge).deposit(10000 * 1e18, TEST_ACCOUNT, false);

        // Schedule a reward of 10000 reward tokens for 4 weeks, starting now
        IERC20(rewardToken).approve(rewardScheduler, type(uint256).max);
        RewardScheduler(rewardScheduler).scheduleReward(10000 * 1e18, 4, true);

        // Check that the gauge has received the reward token
        assertEq(IERC20(rewardToken).balanceOf(rewardForwarder), 0);
        assertEq(IERC20(rewardToken).balanceOf(gauge), 2500 * 1e18);

        // Retrieve latest reward_data from gauge
        (
            ,
            uint256 periodFinish,
            uint256 rate,
            uint256 lastUpdate,

        ) = IChildGaugeLike(gauge).reward_data(rewardToken);

        // Last update was now
        assertEq(lastUpdate, block.timestamp);
        // The reward rate is 2500 * 1e18 / 604800 = 4546957671957671
        assertEq(rate, (2500 * 1e18) / uint256(1 weeks));
        // This batch of rewards will end 1 week later
        assertEq(periodFinish, block.timestamp + 1 weeks);

        // Skip a day
        vm.warp(block.timestamp + 1 days);

        // Try claiminig rewards from an existing staker who has not interacted with the gauge
        // since the rewards were added
        assertEq(IERC20(rewardToken).balanceOf(TEST_ACCOUNT), 0);
        IChildGaugeLike(gauge).claim_rewards();

        // Verify that the staker has received the rewards
        assertEq(
            IERC20(rewardToken).balanceOf(TEST_ACCOUNT),
            24889781232008850000
        );
    }

    function test_scheduleRewardRevertsWhenCalledByNonOwner() public {
        vm.startPrank(DEPLOYER);
        // Try scheduling reward from non-owner account
        IERC20(rewardToken).approve(rewardScheduler, type(uint256).max);
        vm.expectRevert();
        RewardScheduler(rewardScheduler).scheduleReward(10000 * 1e18, 4, false);
    }

    function test_scheduleRewardRevertsWhenNotEnoughTokenAmount() public {
        vm.startPrank(TEST_ACCOUNT);
        // Try scheduling reward from non-owner account
        IERC20(rewardToken).approve(rewardScheduler, type(uint256).max);
        vm.expectRevert();
        RewardScheduler(rewardScheduler).scheduleReward(
            1_000_000 * 1e18,
            4,
            false
        );
    }

    function test_cancelReward() public {
        vm.startPrank(TEST_ACCOUNT);

        // Schedule a reward of 10000 reward tokens for 4 weeks, starting now
        IERC20(rewardToken).approve(rewardScheduler, type(uint256).max);
        RewardScheduler(rewardScheduler).scheduleReward(10000 * 1e18, 4, true);

        // Verify rewards are scheduled
        assertEq(RewardScheduler(rewardScheduler).numOfWeeksLeft(), 3);
        assertEq(
            RewardScheduler(rewardScheduler).amountPerWeek(),
            (10000 * 1e18) / 4
        );

        // Cancel the reward
        RewardScheduler(rewardScheduler).cancelReward();

        // Verify the future rewards are cancelled and the reward token is returned
        // States are reset to initial values
        assertEq(RewardScheduler(rewardScheduler).numOfWeeksLeft(), 0);
        assertEq(RewardScheduler(rewardScheduler).amountPerWeek(), 0);
        assertEq(RewardScheduler(rewardScheduler).lastTimestamp(), 0);

        // Reward token is returned to the owner
        assertEq(IERC20(rewardToken).balanceOf(rewardScheduler), 0);
        assertEq(IERC20(rewardToken).balanceOf(TEST_ACCOUNT), 7500 * 1e18);
        // Note that the first week of rewards are sent out as soon as the reward is scheduled
    }

    function test_cancelRewardThenSchedule() public {
        vm.startPrank(TEST_ACCOUNT);

        // Schedule a reward of 1000 reward tokens for 4 weeks
        IERC20(rewardToken).approve(rewardScheduler, type(uint256).max);
        RewardScheduler(rewardScheduler).scheduleReward(1000 * 1e18, 4, true);

        // Cancel the reward
        RewardScheduler(rewardScheduler).cancelReward();

        // Schedule a reward of 5000 reward tokens for 2 weeks
        RewardScheduler(rewardScheduler).scheduleReward(5000 * 1e18, 2, true);

        // Retrieve latest reward_data from gauge
        (
            ,
            uint256 periodFinish,
            uint256 rate,
            uint256 lastUpdate,

        ) = IChildGaugeLike(gauge).reward_data(rewardToken);

        // Last update was now
        assertEq(lastUpdate, block.timestamp);
        // The reward rate is (250 * 1e18 + 2500 * 1e18) / 604800
        assertEq(rate, (250 * 1e18 + 2500 * 1e18) / uint256(1 weeks));
        // This batch of rewards will end 1 week later
        assertEq(periodFinish, block.timestamp + 1 weeks);
    }
}
