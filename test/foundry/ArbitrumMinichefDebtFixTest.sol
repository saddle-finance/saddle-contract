// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../../forge-script/TestWithConstants.sol";
import "forge-std/console.sol";

struct PoolInfo {
    uint128 accSaddlePerShare;
    uint64 lastRewardTime;
    uint64 allocPoint;
}

struct UserInfo {
    uint256 amount;
    int256 rewardDebt;
}

interface IMiniChefV2 {
    function pendingSaddle(uint256 _pid, address _user)
        external
        view
        returns (uint256 pending);

    function setSaddlePerSecond(uint256 _saddlePerSecond) external;

    function updatePool(uint256 pid) external returns (PoolInfo memory pool);

    function set(
        uint256 _pid,
        uint256 _allocPoint,
        address _rewarder,
        bool overwrite
    ) external;

    function deposit(
        uint256 pid,
        uint256 amount,
        address to
    ) external;

    function withdraw(
        uint256 pid,
        uint256 amount,
        address to
    ) external;

    function harvest(uint256 pid, address to) external;

    function owner() external view returns (address);

    function poolInfo(uint256) external view returns (PoolInfo memory);

    function userInfo(uint256, address) external view returns (UserInfo memory);
}

contract ArbitrumMinichefDebtFixTest is TestWithConstants {
    IMiniChefV2 public minichef;
    uint256 public constant PID = 3;
    address public constant USER_ACCOUNT =
        0x886f2d09909CaA489c745927E200AFd5aF198444;
    address public minichefOwner;

    // Params to use for the fix
    uint256 public constant NEW_SADDLE_PER_SECOND = 2_500_000;
    uint256 public constant DURATION = 1 days;
    uint256 public constant NEW_ALLOC_POINT = 1000;

    function setUp() public override {
        super.setUp();
        // Fork arbitrum at block 61248913, (Feb-15-2023 08:26:16 PM +UTC)
        vm.createSelectFork("arbitrum_mainnet", 61248913);
        minichef = IMiniChefV2(getDeploymentAddress("MiniChefV2"));
        minichefOwner = minichef.owner();
    }

    // Get UserInfo and print it to the console
    function printUserInfo(uint256 _pid, address userAddress)
        public
        view
        returns (UserInfo memory)
    {
        UserInfo memory userInfo = minichef.userInfo(_pid, userAddress);
        console.log(
            "UserInfo: \n amount: %s, rewardDebt: %s",
            userInfo.amount,
            uint256(userInfo.rewardDebt)
        );
        return userInfo;
    }

    // Get PoolInfo and print it to the console
    function printPoolInfo(uint256 _pid) public view returns (PoolInfo memory) {
        PoolInfo memory info = minichef.poolInfo(_pid);
        console.log(
            "PoolInfo: \n accSaddlePerShare: %s, lastRewardTime: %s, allocPoint: %s",
            info.accSaddlePerShare,
            info.lastRewardTime,
            info.allocPoint
        );
        return info;
    }

    // Test that pendingSaddle reverts when the pool is not updated
    function test_ReadingPendingSaddle() public {
        vm.startPrank(USER_ACCOUNT);

        printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Expect pendingSaddle to revert as is
        vm.expectRevert();
        minichef.pendingSaddle(PID, USER_ACCOUNT);
    }

    // Test that pendingSaddle works after the pool is updated with a new allocPoint
    // and new SaddlePerSecond. Verify that the pendingSaddle call is unblocked.
    function test_IncreasingSaddlePerSecondUnblocksPendingSaddle() public {
        vm.startPrank(minichefOwner);

        printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Increase SaddlePerSecond and allocPoint
        minichef.setSaddlePerSecond(NEW_SADDLE_PER_SECOND);
        minichef.set(PID, NEW_ALLOC_POINT, address(0), false);

        // Skip time by some duration
        vm.warp(block.timestamp + DURATION);

        // Call updatePool which would modify poolInfo.accSaddleperShare
        minichef.updatePool(PID);
        printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Verify unblocks pendingSaddle
        uint256 pending = minichef.pendingSaddle(PID, USER_ACCOUNT);
        console.log("pendingSaddle() after %s seconds : %s", DURATION, pending);
    }

    // Test that harvest is unblocked after the pool is updated.
    function test_IncreasingSaddlePerSecondUnblocksHarvest() public {
        vm.startPrank(minichefOwner);

        PoolInfo memory infoBefore = printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Increase SaddlePerSecond and allocPoint
        minichef.setSaddlePerSecond(NEW_SADDLE_PER_SECOND);
        minichef.set(PID, NEW_ALLOC_POINT, address(0), false);

        // Skip time by some duration
        vm.warp(block.timestamp + DURATION);

        // Update pool after some duration to increase poolInfo.accSaddleperShare by 1
        minichef.updatePool(PID);

        // Verify the change in poolInfo.accSaddleperShare
        PoolInfo memory infoAfter = printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Assert that poolInfo.accSaddleperShare has increased by 1
        assertEq(infoBefore.accSaddlePerShare + 1, infoAfter.accSaddlePerShare);

        // Verify this unblocks harvest
        vm.stopPrank();
        vm.startPrank(USER_ACCOUNT);
        minichef.harvest(PID, USER_ACCOUNT);

        // Verify pendingSaddle works after harvest
        printUserInfo(PID, USER_ACCOUNT);
        uint256 pending = minichef.pendingSaddle(PID, USER_ACCOUNT);
        assertEq(pending, 0);
    }

    // Test that fix works even after setting allocPoint and SaddlePerSecond to 0
    // if the duration with the new allocPoint and SaddlePerSecond is long enough.
    function test_IncreasingSaddlePerSecondThenSettingToZeroFix() public {
        vm.startPrank(minichefOwner);

        PoolInfo memory infoBefore = printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Increase SaddlePerSecond and allocPoint
        minichef.setSaddlePerSecond(NEW_SADDLE_PER_SECOND);
        minichef.set(PID, NEW_ALLOC_POINT, address(0), false);

        // Skip time by some duration
        vm.warp(block.timestamp + DURATION);

        // Update pool after some duration to increase poolInfo.accSaddleperShare by 1
        minichef.updatePool(PID);

        // Set SaddlePerSecond and allocPoint to 0 again to prevent future rewards
        minichef.setSaddlePerSecond(0);
        minichef.set(PID, 0, address(0), false);
        minichef.updatePool(PID);

        // Verify the change in poolInfo.accSaddleperShare
        PoolInfo memory infoAfter = printPoolInfo(PID);
        printUserInfo(PID, USER_ACCOUNT);

        // Assert that poolInfo.accSaddleperShare has increased by 1
        assertEq(infoBefore.accSaddlePerShare + 1, infoAfter.accSaddlePerShare);

        // Verify this unblocks harvest
        vm.stopPrank();
        vm.startPrank(USER_ACCOUNT);
        minichef.harvest(PID, USER_ACCOUNT);

        // Verify pendingSaddle works after harvest
        printUserInfo(PID, USER_ACCOUNT);
        uint256 pending = minichef.pendingSaddle(PID, USER_ACCOUNT);
        assertEq(pending, 0);
    }
}
