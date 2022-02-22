// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity-e06e943/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity-e06e943/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity-e06e943/contracts/BoringOwnable.sol";
import "../interfaces/IRewarder.sol";

interface IMiniChef {
    function lpToken(uint256 pid) external view returns (IERC20 _lpToken);
}

/**
 * @title SimpleRewarder
 * @notice Rewarder contract that can add one additional reward token to a specific PID in MiniChef.
 * Emission rate is controlled by the owner of this contract, independently from MiniChef's owner.
 * @author @0xKeno @weeb_mcgee
 */
contract SimpleRewarder is IRewarder, BoringOwnable {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using BoringERC20 for IERC20;

    uint256 private constant ACC_TOKEN_PRECISION = 1e12;

    /// @notice Info of each Rewarder user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of Reward Token entitled to the user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    /// @notice Info of the rewarder pool
    struct PoolInfo {
        uint128 accToken1PerShare;
        uint64 lastRewardTime;
    }

    /// @notice Address of the token that should be given out as rewards.
    IERC20 public rewardToken;

    /// @notice Var to track the rewarder pool.
    PoolInfo public poolInfo;

    /// @notice Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    /// @notice Total emission rate of the reward token per second
    uint256 public rewardPerSecond;
    /// @notice Address of the lp token that should be incentivized
    IERC20 public masterLpToken;
    /// @notice PID in MiniChef that corresponds to masterLpToken
    uint256 public pid;

    /// @notice MiniChef contract that will call this contract's callback function
    address public immutable MINICHEF;

    event LogOnReward(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        address indexed to
    );
    event LogUpdatePool(
        uint256 indexed pid,
        uint64 lastRewardTime,
        uint256 lpSupply,
        uint256 accToken1PerShare
    );
    event LogRewardPerSecond(uint256 rewardPerSecond);
    event LogInit(
        IERC20 indexed rewardToken,
        address owner,
        uint256 rewardPerSecond,
        IERC20 indexed masterLpToken
    );

    /**
     * @notice Deploys this contract and sets immutable MiniChef address.
     */
    constructor(address _MINICHEF) public {
        MINICHEF = _MINICHEF;
    }

    /**
     * @notice Modifier to restrict caller to be only MiniChef
     */
    modifier onlyMiniChef() {
        require(msg.sender == MINICHEF, "Rewarder: caller is not MiniChef");
        _;
    }

    /**
     * @notice Serves as the constructor for clones, as clones can't have a regular constructor.
     * Initializes state variables with the given parameter.
     * @param data abi encoded data in format of (IERC20 rewardToken, address owner, uint256 rewardPerSecond, IERC20 masterLpToken, uint256 pid).
     */
    function init(bytes calldata data) public payable {
        require(rewardToken == IERC20(0), "Rewarder: already initialized");
        address _owner;
        (rewardToken, _owner, rewardPerSecond, masterLpToken, pid) = abi.decode(
            data,
            (IERC20, address, uint256, IERC20, uint256)
        );
        require(rewardToken != IERC20(0), "Rewarder: bad rewardToken");
        require(
            IMiniChef(MINICHEF).lpToken(pid) == masterLpToken,
            "Rewarder: bad pid or masterLpToken"
        );
        transferOwnership(_owner, true, false);
        emit LogInit(rewardToken, _owner, rewardPerSecond, masterLpToken);
    }

    /**
     * @notice Callback function for when the user claims via the MiniChef contract.
     * @param _pid PID of the pool it was called for
     * @param _user address of the user who is claiming rewards
     * @param to address to send the reward token to
     * @param lpTokenAmount amount of total lp tokens that the user has it staked
     */
    function onSaddleReward(
        uint256 _pid,
        address _user,
        address to,
        uint256,
        uint256 lpTokenAmount
    ) external override onlyMiniChef {
        require(pid == _pid, "Rewarder: bad pid init");

        PoolInfo memory pool = updatePool();
        UserInfo storage user = userInfo[_user];
        uint256 pending;
        if (user.amount > 0) {
            pending = (user.amount.mul(pool.accToken1PerShare) /
                ACC_TOKEN_PRECISION).sub(user.rewardDebt);
            rewardToken.safeTransfer(to, pending);
        }
        user.amount = lpTokenAmount;
        user.rewardDebt =
            lpTokenAmount.mul(pool.accToken1PerShare) /
            ACC_TOKEN_PRECISION;
        emit LogOnReward(_user, pid, pending, to);
    }

    /**
     * @notice Sets the reward token per second to be distributed. Can only be called by the owner.
     * @param _rewardPerSecond The amount of reward token to be distributed per second.
     */
    function setRewardPerSecond(uint256 _rewardPerSecond) public onlyOwner {
        rewardPerSecond = _rewardPerSecond;
        emit LogRewardPerSecond(_rewardPerSecond);
    }

    /**
     * @notice View function to see pending rewards for given address
     * @param _user Address of user.
     * @return pending reward for a given user.
     */
    function pendingToken(address _user) public view returns (uint256 pending) {
        PoolInfo memory pool = poolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 accToken1PerShare = pool.accToken1PerShare;
        uint256 lpSupply = IMiniChef(MINICHEF).lpToken(pid).balanceOf(MINICHEF);
        if (block.timestamp > pool.lastRewardTime && lpSupply != 0) {
            uint256 time = block.timestamp.sub(pool.lastRewardTime);
            uint256 reward = time.mul(rewardPerSecond);
            accToken1PerShare = accToken1PerShare.add(
                reward.mul(ACC_TOKEN_PRECISION) / lpSupply
            );
        }
        pending = (user.amount.mul(accToken1PerShare) / ACC_TOKEN_PRECISION)
            .sub(user.rewardDebt);
    }

    /**
     * @notice Returns pending reward tokens addresses and reward amounts for given address.
     * @dev Since SimpleRewarder supports only one additional reward, the returning arrays will only have one element.
     * @param user address of the user
     * @return rewardTokens array of reward tokens' addresses
     * @return rewardAmounts array of reward tokens' amounts
     */
    function pendingTokens(
        uint256,
        address user,
        uint256
    )
        external
        view
        override
        returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts)
    {
        IERC20[] memory _rewardTokens = new IERC20[](1);
        _rewardTokens[0] = (rewardToken);
        uint256[] memory _rewardAmounts = new uint256[](1);
        _rewardAmounts[0] = pendingToken(user);
        return (_rewardTokens, _rewardAmounts);
    }

    /**
     * @notice Updates the stored rate of emission per share since the last time this function was called.
     * @dev This is called whenever `onSaddleReward` is called to ensure the rewards are given out with the
     * correct emission rate.
     */
    function updatePool() public returns (PoolInfo memory pool) {
        pool = poolInfo;
        if (block.timestamp > pool.lastRewardTime) {
            uint256 lpSupply = IMiniChef(MINICHEF).lpToken(pid).balanceOf(
                MINICHEF
            );

            if (lpSupply > 0) {
                uint256 time = block.timestamp.sub(pool.lastRewardTime);
                uint256 reward = time.mul(rewardPerSecond);
                pool.accToken1PerShare = pool.accToken1PerShare.add(
                    (reward.mul(ACC_TOKEN_PRECISION) / lpSupply).to128()
                );
            }
            pool.lastRewardTime = block.timestamp.to64();
            poolInfo = pool;
            emit LogUpdatePool(
                pid,
                pool.lastRewardTime,
                lpSupply,
                pool.accToken1PerShare
            );
        }
    }
}
