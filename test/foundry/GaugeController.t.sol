// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../../forge-script/TestWithConstants.sol";
import "forge-std/console2.sol";

struct Point {
    uint256 bias;
    uint256 slope;
}
struct VotedSlope {
    uint256 slope;
    uint256 power;
    uint256 end;
}
struct InflationParams {
    uint256 rate;
    uint256 finish_time;
}

interface IRootGaugeLike {
    function add_reward(address _reward_token, address _reward_distributor)
        external;

    function manager() external view returns (address);

    function set_killed(bool) external;

    function inflation_params() external view returns (InflationParams memory);

    function user_checkpoint(address) external returns (bool);
}

interface IRootGaugeFactoryLike {
    function deploy_gauge(
        uint256 _chain_id,
        bytes32 _salt,
        string memory _name
    ) external returns (address);

    function get_gauge(uint256, uint256) external view returns (address);

    function owner() external view returns (address);
}

interface IGaugeControllerLike {
    function admin() external view returns (address);

    function add_gauge(
        address,
        int128,
        uint256
    ) external;

    function points_weight(address, uint256)
        external
        view
        returns (Point memory);

    function gauge_relative_weight(address) external view returns (uint256);

    function checkpoint() external;

    function vote_for_gauge_weights(address, uint256) external;

    // vote_user_slopes: public(HashMap[address, HashMap[address, VotedSlope]])
    function vote_user_slopes(address, address)
        external
        view
        returns (VotedSlope memory);
}

contract GaugeControllerTest is TestWithConstants {
    // Existing contracts
    address public rewardToken;
    address public rootGaugefUSDC;
    address public fraxGauge;
    address public rootGaugeFactory;
    address public gaugeController;
    address public minter;

    // Deployed at setup
    address public rootGaugefUSDCV2;

    // Needed consts
    address public constant gaugeVoter =
        0xaA983Fe498c300094B708c3B48deDE9bd91A0183;

    function setUp() public override {
        super.setUp();
        // Fork mainnet at block 17075747, (Apr-18-2023 07:52:59 PM +UTC)
        vm.createSelectFork("mainnet", 17075747);

        // Read addresses from deployment jsons
        rewardToken = getDeploymentAddress("SDL");
        rootGaugefUSDC = getDeploymentAddress(
            "RootGauge_42161_CommunityfUSDCPoolLPToken"
        );
        fraxGauge = getDeploymentAddress(
            "RootGauge_42161_SaddleFRAXBPPoolLPToken"
        );
        rootGaugeFactory = getDeploymentAddress("RootGaugeFactory");
        gaugeController = getDeploymentAddress("GaugeController");
        minter = getDeploymentAddress("Minter");

        // Deploy new root gauge from rootGaugeFactory
        vm.startPrank(DEPLOYER);
        // _chain_id: uint256, _salt: bytes32, _name: String[32]
        vm.recordLogs();
        IRootGaugeFactoryLike(rootGaugeFactory).deploy_gauge(
            42161,
            keccak256(bytes("fUSDC-USDC pool V2")),
            "fUSDC-USDC pool V2"
        );
        vm.stopPrank();
        // test adding new gauge, voting for it, killing old one check for inflation params after kill, after checkpoint
    }

    function test_V2GaugeAdd() public {
        // It should be possible to add a new gauge to the gauge controller that shares an lp with another added gauge
        // Get the address of the newly deployed gauge
        rootGaugefUSDCV2 = IRootGaugeFactoryLike(rootGaugeFactory).get_gauge(
            42161,
            8
        );

        // Pretend to be the gauge controller owner and add the new gauge
        vm.prank(IGaugeControllerLike(gaugeController).admin());
        IGaugeControllerLike(gaugeController).add_gauge(rootGaugefUSDCV2, 0, 0);
        IRootGaugeLike(rootGaugefUSDCV2).user_checkpoint(gaugeVoter);
        uint256 weight = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(rootGaugefUSDCV2);
        uint256 votedUserSlope = IGaugeControllerLike(gaugeController)
            .vote_user_slopes(gaugeVoter, rootGaugefUSDCV2)
            .slope;
        // Prank as a user and vote for the new gauge
        vm.startPrank(gaugeVoter);
        // remove old votes for user
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            fraxGauge,
            0
        );
        // vote for new gauge
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            rootGaugefUSDCV2,
            10000
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 604800);
        IRootGaugeLike(rootGaugefUSDCV2).user_checkpoint(gaugeVoter);
        uint256 weightAfter = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(rootGaugefUSDCV2);
        uint256 votedUserSlopeAfter = IGaugeControllerLike(gaugeController)
            .vote_user_slopes(gaugeVoter, rootGaugefUSDCV2)
            .slope;
        console2.log("votedUserSlope: ", votedUserSlope);
        console2.log("votedUserSlopeAfter: ", votedUserSlopeAfter);
        console2.log("weight: ", weight);
        console2.log("weightAfter: ", weightAfter);
        assert(weightAfter > weight);
        assert(
            votedUserSlopeAfter > votedUserSlope
        );
    }

    function test_KillingGauge() public {
        // Get values before and after the killing of a gauge with active votes
        uint256 weightBefore = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(fraxGauge);
        uint256 inflationRateBefore = IRootGaugeLike(fraxGauge)
            .inflation_params()
            .rate;
        // Pretend to be the RootGaugeFactory admin and kill the gauge
        vm.prank(IRootGaugeFactoryLike(rootGaugeFactory).owner());
        IRootGaugeLike(fraxGauge).set_killed(true);
        IRootGaugeLike(fraxGauge).user_checkpoint(gaugeVoter);
        vm.warp(block.timestamp + 604800);
        IRootGaugeLike(fraxGauge).user_checkpoint(gaugeVoter);
        uint256 weightAfter = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(fraxGauge);
        uint256 inflationRateAfter = IRootGaugeLike(fraxGauge)
            .inflation_params()
            .rate;
        console2.log("weight before: ", weightBefore);
        console2.log("weight after: ", weightAfter);
        console2.log("inflationRateBefore: ", inflationRateBefore);
        console2.log("inflationRateAfter: ", inflationRateAfter);
        assert(inflationRateAfter == 0);
        // assert(weightAfter < weightBefore); // weight still stays after kill
    }

    function test_KillThenAdd() public {
        // Pretend to be the RootGaugeFactory admin and kill the gauge
        vm.prank(IRootGaugeFactoryLike(rootGaugeFactory).owner());
        IRootGaugeLike(rootGaugefUSDC).set_killed(true);
        // Pretend to be the gauge controller owner and add the new gauge
        vm.prank(IGaugeControllerLike(gaugeController).admin());
        IGaugeControllerLike(gaugeController).add_gauge(rootGaugefUSDCV2, 0, 0);
        // Prank as gauge user and vote for the new gauge
        vm.startPrank(gaugeVoter);
        // remove old votes for user
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            fraxGauge,
            0
        );
        // vote for new gauge
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            rootGaugefUSDCV2,
            10000
        );
        vm.stopPrank();
    }

        function test_VoteForKilled() public {
        // Pretend to be the RootGaugeFactory admin and kill the gauge
        vm.prank(IRootGaugeFactoryLike(rootGaugeFactory).owner());
        IRootGaugeLike(rootGaugefUSDC).set_killed(true);
        uint256 weightAfterKill = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(rootGaugefUSDC);
        uint256 votedUserSlopeAfterKill = IGaugeControllerLike(gaugeController)
            .vote_user_slopes(gaugeVoter, rootGaugefUSDC)
            .slope;
        uint256 inflationRateAfterKill = IRootGaugeLike(rootGaugefUSDC)
            .inflation_params()
            .rate;
        // Prank as gauge user and vote for the killed gauge
        vm.startPrank(gaugeVoter);
        // remove old votes for user
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            fraxGauge,
            0
        );
        // vote for new gauge
        IGaugeControllerLike(gaugeController).vote_for_gauge_weights(
            rootGaugefUSDC,
            10000
        );
        vm.stopPrank();
        IRootGaugeLike(rootGaugefUSDC).user_checkpoint(gaugeVoter);
        uint256 weightAfterVote = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(rootGaugefUSDC);
        uint256 votedUserSlopeAfterVote = IGaugeControllerLike(gaugeController)
            .vote_user_slopes(gaugeVoter, rootGaugefUSDC)
            .slope;
        uint256 inflationRateAfterVote = IRootGaugeLike(rootGaugefUSDC)
            .inflation_params()
            .rate;
        vm.warp(block.timestamp + 604800);
        IRootGaugeLike(rootGaugefUSDC).user_checkpoint(gaugeVoter);
        uint256 weightAfterWeek = IGaugeControllerLike(gaugeController)
            .gauge_relative_weight(rootGaugefUSDC);
        uint256 votedUserSlopeAfterWeek = IGaugeControllerLike(gaugeController)
            .vote_user_slopes(gaugeVoter, rootGaugefUSDC)
            .slope;
        uint256 inflationRateAfterWeek = IRootGaugeLike(rootGaugefUSDC)
            .inflation_params()
            .rate;
        console2.log("weightAfterKill: ", weightAfterKill);
        console2.log("weightAfterVote: ", weightAfterVote);
        console2.log("weightAfterWeek: ", weightAfterWeek);
        console2.log("votedUserSlopeAfterKill: ", votedUserSlopeAfterKill);
        console2.log("votedUserSlopeAfterVote: ", votedUserSlopeAfterVote);
        console2.log("votedUserSlopeAfterWeek: ", votedUserSlopeAfterWeek);
        console2.log("inflationRateAfterKill: ", inflationRateAfterKill);
        console2.log("inflationRateAfterVote: ", inflationRateAfterVote);
        console2.log("inflationRateAfterWeek: ", inflationRateAfterWeek);
    }
}
