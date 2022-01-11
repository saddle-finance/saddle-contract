// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-4.2.0/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable-4.2.0/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-4.2.0/utils/Context.sol";
import "./SimpleGovernance.sol";

/**
 * @title Vesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Owner has the power
 * to change the beneficiary who receives the vested tokens.
 */
contract Vesting is Initializable, Context {
    using SafeERC20 for IERC20;

    event Released(uint256 amount);
    event VestingInitialized(
        address indexed beneficiary,
        uint256 startTimestamp,
        uint256 cliff,
        uint256 duration
    );
    event SetBeneficiary(address indexed beneficiary);

    // beneficiary of tokens after they are released
    address public beneficiary;
    IERC20 public token;

    uint256 public cliffInSeconds;
    uint256 public durationInSeconds;
    uint256 public startTimestamp;
    uint256 public released;

    /**
     * @dev Sets the beneficiary to _msgSender() on deploying this contract. This prevents others from
     * initializing the logic contract.
     */
    constructor() public {
        beneficiary = _msgSender();
    }

    /**
     * @dev Limits certain functions to be called by governance
     */
    modifier onlyGovernance() {
        require(
            _msgSender() == governance(),
            "only governance can perform this action"
        );
        _;
    }

    /**
     * @dev Initializes a vesting contract that vests its balance of any ERC20 token to the
     * _beneficiary, monthly in a linear fashion until duration has passed. By then all
     * of the balance will have vested.
     * @param _token address of the token that is subject to vesting
     * @param _beneficiary address of the beneficiary to whom vested tokens are transferred
     * @param _cliffInSeconds duration in months of the cliff in which tokens will begin to vest
     * @param _durationInSeconds duration in months of the period in which the tokens will vest
     * @param _startTimestamp start timestamp when the cliff and vesting should start to count
     */
    function initialize(
        address _token,
        address _beneficiary,
        uint256 _startTimestamp,
        uint256 _cliffInSeconds,
        uint256 _durationInSeconds
    ) external initializer {
        require(_token != address(0), "_token cannot be empty");
        // dev: beneficiary is set to msg.sender on logic contracts during deployment
        require(beneficiary == address(0), "cannot initialize logic contract");
        require(_beneficiary != address(0), "_beneficiary cannot be empty");
        require(_startTimestamp != 0, "startTimestamp cannot be 0");
        require(
            _startTimestamp <= block.timestamp,
            "startTimestamp cannot be from the future"
        );
        require(_durationInSeconds != 0, "duration cannot be 0");
        require(
            _cliffInSeconds <= _durationInSeconds,
            "cliff is greater than duration"
        );

        token = IERC20(_token);
        beneficiary = _beneficiary;
        startTimestamp = _startTimestamp;
        durationInSeconds = _durationInSeconds;
        cliffInSeconds = _cliffInSeconds;

        emit VestingInitialized(
            _beneficiary,
            _startTimestamp,
            _cliffInSeconds,
            _durationInSeconds
        );
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     */
    function release() external {
        uint256 vested = vestedAmount();
        require(vested > 0, "No tokens to release");

        released = released + vested;
        emit Released(vested);
        token.safeTransfer(beneficiary, vested);
    }

    /**
     * @notice Calculates the amount that has already vested but hasn't been released yet.
     */
    function vestedAmount() public view returns (uint256) {
        uint256 blockTimestamp = block.timestamp;
        uint256 _durationInSeconds = durationInSeconds;

        uint256 elapsedTime = blockTimestamp - startTimestamp; // @dev startTimestamp is always less than blockTimestamp

        if (elapsedTime < cliffInSeconds) {
            return 0;
        }

        // If over vesting duration, all tokens vested
        if (elapsedTime >= _durationInSeconds) {
            return token.balanceOf(address(this));
        } else {
            uint256 currentBalance = token.balanceOf(address(this));

            // If there are no tokens in this contract yet, return 0.
            if (currentBalance == 0) {
                return 0;
            }

            uint256 totalBalance = currentBalance + released;
            uint256 vested = (totalBalance * elapsedTime) / _durationInSeconds;
            uint256 unreleased = vested - released;

            return unreleased;
        }
    }

    /**
     * @notice Changes beneficiary who receives the vested token.
     * @dev Only governance can call this function. This is to be used in case the target address
     * needs to be updated. If the previous beneficiary has any unclaimed tokens, the new beneficiary
     * will be able to claim them and the rest of the vested tokens.
     * @param newBeneficiary new address to become the beneficiary
     */
    function changeBeneficiary(address newBeneficiary) external onlyGovernance {
        require(
            newBeneficiary != beneficiary,
            "beneficiary must be different from current one"
        );
        require(newBeneficiary != address(0), "beneficiary cannot be empty");
        beneficiary = newBeneficiary;
        emit SetBeneficiary(newBeneficiary);
    }

    /**
     * @notice Governance who owns this contract.
     * @dev Governance of the token contract also owns this vesting contract.
     */
    function governance() public view returns (address) {
        return SimpleGovernance(address(token)).governance();
    }
}
