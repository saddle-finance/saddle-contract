// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-4.4.0/utils/math/Math.sol";
import "../../interfaces/IVotingEscrow.sol";

/** @title VeSDLRewards
    @notice Gauge like contract that simulates veSDL stake.
 */

contract VeSDLRewards {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken; // immutable are breaking coverage software should be added back after.
    IVotingEscrow public veToken; // immutable
    uint256 public constant DURATION = 7 days;
    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public queuedRewards = 0;
    uint256 public currentRewards = 0;
    uint256 public historicalRewards = 0;
    address public gov;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    // whitelisted addresses have right to claim and lock into veSDL on anothers behalf
    mapping(address => bool) public whitelist;

    event RewardAdded(uint256 reward);
    event Donate(uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event UpdatedGov(address gov);
    event UpdatedWhitelist(address recipient, bool isWhitelisted);

    constructor(
        address veToken_,
        address rewardToken_,
        address gov_
    ) {
        veToken = IVotingEscrow(veToken_);
        rewardToken = IERC20(rewardToken_);
        gov = gov_;
    }

    modifier _updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        if (account != address(0)) {
            rewards[account] = _earnedReward(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /**
     *  @return timestamp until rewards are distributed
     */
    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    /** @notice reward per token deposited
     *  @dev gives the total amount of rewards distributed since inception of the pool per vault token
     *  @return rewardPerToken
     */
    function rewardPerToken() public view returns (uint256) {
        uint256 supply = veToken.totalSupply();
        if (supply == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            (((lastTimeRewardApplicable() - lastUpdateTime) *
                rewardRate *
                1e18) / supply);
    }

    function _earnedReward(address account) internal view returns (uint256) {
        return
            (veToken.balanceOf(account) *
                (rewardPerToken() - userRewardPerTokenPaid[account])) /
            1e18 +
            rewards[account];
    }

    /** @notice earning for an account
     *  @return amount of tokens earned
     */
    function earned(address account) external view returns (uint256) {
        return _earnedReward(account);
    }

    /** @notice use to update rewards on veSDL balance changes.
        @dev called by veSDL
     *  @return true
     */
    function updateReward(address _account)
        external
        _updateReward(_account)
        returns (bool)
    {
        require(msg.sender == address(veToken), "!authorized");

        return true;
    }

    /**
     * @notice
     *  Get rewards for an account
     * @dev rewards are transfer to _account
     * @param _account to claim rewards for
     * @param _lock should it lock rewards into veSDL
     * @return true
     */
    function getRewardFor(address _account, bool _lock)
        external
        returns (bool)
    {
        _getReward(
            _account,
            (whitelist[msg.sender] || msg.sender == _account) ? _lock : false
        );
        return true;
    }

    /**
     * @notice
     *  Get rewards
     * @param _lock should it lock rewards into veSDL
     * @return true
     */
    function getReward(bool _lock) external returns (bool) {
        _getReward(msg.sender, _lock);
        return true;
    }

    /**
     * @notice
     *  Get rewards
     * @return true
     */
    function getReward() external returns (bool) {
        _getReward(msg.sender, false);
        return true;
    }

    function _getReward(address _account, bool _lock)
        internal
        _updateReward(_account)
    {
        uint256 reward = rewards[_account];
        if (reward == 0) return;
        rewards[_account] = 0;

        if (_lock) {
            SafeERC20.safeApprove(rewardToken, address(veToken), reward);
            veToken.deposit_for(_account, reward);
        } else {
            SafeERC20.safeTransfer(rewardToken, _account, reward);
        }

        emit RewardPaid(_account, reward);
    }

    /**
     * @notice
     *  Donate tokens to distribute as rewards
     * @dev Do not trigger rewardRate recalculation
     * @param _amount token to donate
     * @return true
     */
    function donate(uint256 _amount) external returns (bool) {
        require(_amount != 0, "==0");
        IERC20(rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        queuedRewards = queuedRewards + _amount;
        emit Donate(_amount);
        return true;
    }

    /**
     * @notice
     * Add new rewards to be distributed over a week
     * @dev Trigger rewardRate recalculation using _amount and queuedRewards
     * @param _amount token to add to rewards
     * @return true
     */
    function queueNewRewards(uint256 _amount) external returns (bool) {
        require(_amount != 0, "==0");
        IERC20(rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        _amount = _amount + queuedRewards;
        _notifyRewardAmount(_amount);
        queuedRewards = 0;

        return true;
    }

    function _notifyRewardAmount(uint256 reward)
        internal
        _updateReward(address(0))
    {
        historicalRewards = historicalRewards + reward;
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / DURATION;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            reward = reward + leftover;
            rewardRate = reward / DURATION;
        }
        currentRewards = reward;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + DURATION;
        emit RewardAdded(reward);
    }

    /**
     * @notice
     * set gov
     * @dev Can be called by gov
     * @param _gov new gov
     * @return true
     */
    function setGov(address _gov) external returns (bool) {
        require(msg.sender == gov, "!authorized");

        require(_gov != address(0), "0 address");
        gov = _gov;
        emit UpdatedGov(_gov);
        return true;
    }

    /**
     * @notice
     * add to whitelist
     * @dev Can be called by gov
     * @param _addr  address to whitelist
     * @param _isWhitelist whether to whitelist or blacklist
     */
    function addToWhitelist(address _addr, bool _isWhitelist) external {
        require(msg.sender == gov, "!authorized");

        require(_addr != address(0), "0 address");
        whitelist[_addr] = _isWhitelist;
        emit UpdatedWhitelist(_addr, _isWhitelist);
    }

    function sweep(address _token) external returns (bool) {
        require(msg.sender == gov, "!authorized");

        SafeERC20.safeTransfer(
            IERC20(_token),
            gov,
            IERC20(_token).balanceOf(address(this))
        );
        return true;
    }
}
