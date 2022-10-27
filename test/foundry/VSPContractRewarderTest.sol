pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/rewards/RewardScheduler.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";

interface IGauge {
    function reward_data(address _reward_token)
        external
        view
        returns (
            address token,
            address distributor,
            uint256 periodFinish,
            uint256 rate,
            uint256 lastUpdate,
            uint256 integral
        );

    function claim_rewards() external;
}

interface IRewardForwarder {
    function depositRewardToken(address _rewardToken) external;

    function allow(address _rewardToken) external;

    function gauge() external view returns (address);
}

contract VSPContractRewarderTest is Test {
    IERC20 private constant VSP =
        IERC20(0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421);

    address private defaultAccount = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    IRewardForwarder private rewardForwarder =
        IRewardForwarder(0x811b699C69ff0AbfF98091919E637fEDCD5DffaC);
    IGauge private gauge = IGauge(0x9980C9b35844946cF3451cC0B43D9b6501F4a96E);

    address private gaugeDepositor = 0xab58779cec2B82A75Ffd103fDc88D7e3aDb13468;

    RewardScheduler private rewardScheduler;

    function setUp() public {
        // Fork mainnet at block 15794506
        // Timestamp: 1666331495 (Fri Oct 21 2022 05:51:35 GMT+0000)
        vm.createSelectFork("mainnet", 15794506);

        // Give some VSP to test account
        vm.startPrank(defaultAccount);
        deal(address(VSP), defaultAccount, 10000 * 1e18);

        rewardScheduler = new RewardScheduler(address(rewardForwarder));
    }

    function testDepositVSP() public {
        // First, transfer some VSP to rewardForwarder contract
        VSP.transfer(address(rewardForwarder), 10000 * 1e18);
        // Then allow the associated gauge to use VSP from rewardForwarder
        rewardForwarder.allow(address(VSP));
        // Then, call depositRewardToken. This will call deposit_reward_token on the gauge
        // which will use the VSP in the rewardForwarder contract as the new weekly reward emission
        // for the gauge.
        rewardForwarder.depositRewardToken(address(VSP));

        // Check that the gauge has received the VSP
        assertEq(VSP.balanceOf(address(rewardForwarder)), 0);
        assertEq(VSP.balanceOf(address(gauge)), 10000 * 1e18);

        // Retrieve latest reward_data from gauge
        (, , uint256 periodFinish, uint256 rate, uint256 lastUpdate, ) = gauge
            .reward_data(address(VSP));

        // This batch of VSP rewards will end on Friday, October 28, 2022 5:51:35 AM
        assertEq(periodFinish, 1666936295);
        // The reward rate is 10000 * 1e18 / 604800 = 16534391534391534
        assertEq(rate, 16534391534391534);
        // Last update was now
        assertEq(lastUpdate, 1666331495);

        // Skip a day
        vm.warp(block.timestamp + 86400);

        // Try claiminig rewards from an existing staker who has not interacted with the gauge
        // since the rewards were added
        vm.stopPrank();
        vm.startPrank(gaugeDepositor);

        assertEq(VSP.balanceOf(gaugeDepositor), 0);
        gauge.claim_rewards();
        assertEq(VSP.balanceOf(gaugeDepositor), 772168546976762865548);
    }

    function testDepositVSPFromRewardScheduler() public {
        // Send in monthly amount of reward to reward scheduler from a funding account
        VSP.approve(address(rewardScheduler), 10000 * 1e18);
        rewardScheduler.scheduleReward(address(VSP), 10000 * 1e18, 4);

        // Check that reward scheduler has received the VSP and that first week
        // worth has been sent to the reward forwarder
        assertEq(rewardScheduler.lastTimestamp(), block.timestamp);
        assertEq(rewardScheduler.numOfWeeksLeft(), 3);

        assertEq(VSP.balanceOf(address(rewardScheduler)), 7500 * 1e18);
        assertEq(VSP.balanceOf(address(rewardForwarder)), 2500 * 1e18);

        // Then allow the associated gauge to use VSP from rewardForwarder
        rewardForwarder.allow(address(VSP));
        // Then, call depositRewardToken. This will call deposit_reward_token on the gauge
        // which will use the VSP in the rewardForwarder contract as the new weekly reward emission
        // for the gauge.
        rewardForwarder.depositRewardToken(address(VSP));

        // Check that the gauge has received the VSP
        assertEq(VSP.balanceOf(address(rewardForwarder)), 0);
        assertEq(VSP.balanceOf(address(gauge)), 2500 * 1e18);

        {
            // Retrieve latest reward_data from gauge
            (
                ,
                ,
                uint256 periodFinish,
                uint256 rate,
                uint256 lastUpdate,

            ) = gauge.reward_data(address(VSP));

            // This batch of VSP rewards will end on Friday, October 28, 2022 5:51:35 AM
            assertEq(periodFinish, 1666936295);
            // The reward rate is 2500 * 1e18 / 604800 = 4133597883597883
            assertEq(rate, 4133597883597883);
            // Last update was now
            assertEq(lastUpdate, 1666331495);
        }

        // Skip a day
        vm.warp(block.timestamp + 86400);

        // Try claiminig rewards from an existing staker who has not interacted with the gauge
        // since the rewards were added
        vm.stopPrank();
        vm.startPrank(gaugeDepositor);

        assertEq(VSP.balanceOf(gaugeDepositor), 0);
        gauge.claim_rewards();
        assertEq(VSP.balanceOf(gaugeDepositor), 193042136744190692973);

        // Now skip to before the end of the reward period
        vm.warp(1666936295 - 1);

        // We expect the next transferReward call to fail due to
        // the reward period not being over (1 week)
        vm.expectRevert("RewardScheduler: not enough time has passed");
        rewardScheduler.transferReward();

        // Now skip to the end of current the reward period
        vm.warp(1666936295);
        rewardScheduler.transferReward();
        rewardForwarder.depositRewardToken(address(VSP));

        // Check that the reward data is updated
        {
            (
                ,
                ,
                uint256 periodFinish,
                uint256 rate,
                uint256 lastUpdate,

            ) = gauge.reward_data(address(VSP));

            // This batch of VSP rewards will end on Friday, November 4, 2022 5:51:35 AM
            assertEq(periodFinish, 1667541095);
            // The reward rate is 2500 * 1e18 / 604800 = 4133597883597883
            assertEq(rate, 4133597883597883);
            // Last update was now
            assertEq(lastUpdate, 1666936295);
        }
    }
}
