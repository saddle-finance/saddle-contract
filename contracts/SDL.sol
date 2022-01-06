// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts-4.2.0/security/Pausable.sol";
import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-4.2.0/proxy/Clones.sol";
import "@openzeppelin/contracts-4.2.0/token/ERC20/extensions/ERC20VotesComp.sol";
import "./Vesting.sol";
import "./SimpleGovernance.sol";

/**
 * @title Saddle DAO token
 * @notice A token that is deployed with fixed amount and appropriate vesting contracts.
 * Transfer is blocked for a period of time until the governance can toggle the transferability.
 */
contract SDL is ERC20Permit, Pausable, SimpleGovernance {
    using SafeERC20 for IERC20;

    // Token max supply is 1,000,000,000 * 1e18 = 1e27
    uint256 public constant MAX_SUPPLY = 1e9 ether;
    uint256 public immutable govCanUnpauseAfter;
    uint256 public immutable anyoneCanUnpauseAfter;
    address public immutable vestingContractTarget;

    mapping(address => bool) public allowedTransferee;

    event Allowed(address indexed target);
    event Disallowed(address indexed target);
    event VestingContractDeployed(
        address indexed beneficiary,
        address vestingContract
    );

    struct Recipient {
        address to;
        uint256 amount;
        uint256 startTimestamp;
        uint256 cliffPeriod;
        uint256 durationPeriod;
    }

    /**
     * @notice Initializes SDL token with specified governance address and recipients. For vesting
     * durations and amounts, please refer to our documentation on token distribution schedule.
     * @param governance_ address of the governance who will own this contract
     * @param pausePeriod_ time in seconds since the deployment. After this period, this token can be unpaused
     * by the governance.
     * @param vestingContractTarget_ logic contract of Vesting.sol to use for cloning
     */
    constructor(
        address governance_,
        uint256 pausePeriod_,
        address vestingContractTarget_
    ) public ERC20("Saddle DAO", "SDL") ERC20Permit("Saddle DAO") {
        require(governance_ != address(0), "SDL: governance cannot be empty");
        require(
            vestingContractTarget_ != address(0),
            "SDL: vesting contract target cannot be empty"
        );
        require(
            pausePeriod_ > 0 && pausePeriod_ <= 52 weeks,
            "SDL: pausePeriod must be in between 0 and 52 weeks"
        );

        // Set state variables
        vestingContractTarget = vestingContractTarget_;
        governance = governance_;
        govCanUnpauseAfter = block.timestamp + pausePeriod_;
        anyoneCanUnpauseAfter = block.timestamp + 52 weeks;

        // Allow governance to transfer tokens
        allowedTransferee[governance_] = true;

        // Mint tokens to governance
        _mint(governance, MAX_SUPPLY);

        // Pause transfers at deployment
        if (pausePeriod_ > 0) {
            _pause();
        }

        emit SetGovernance(governance_);
    }

    /**
     * @notice Deploys a clone of the vesting contract for the given recipient. Details about vesting and token
     * release schedule can be found on https://docs.saddle.finance
     * @param recipient Recipient of the token through the vesting schedule.
     */
    function deployNewVestingContract(Recipient memory recipient)
        public
        onlyGovernance
        returns (address)
    {
        require(
            recipient.durationPeriod > 0,
            "SDL: duration for vesting cannot be 0"
        );

        // Deploy a clone rather than deploying a whole new contract
        Vesting vestingContract = Vesting(Clones.clone(vestingContractTarget));

        // Initialize the clone contract for the recipient
        vestingContract.initialize(
            address(this),
            recipient.to,
            recipient.startTimestamp,
            recipient.cliffPeriod,
            recipient.durationPeriod
        );

        // Send tokens to the contract
        IERC20(address(this)).safeTransferFrom(
            msg.sender,
            address(vestingContract),
            recipient.amount
        );

        // Add the vesting contract to the allowed transferee list
        allowedTransferee[address(vestingContract)] = true;
        emit Allowed(address(vestingContract));
        emit VestingContractDeployed(recipient.to, address(vestingContract));

        return address(vestingContract);
    }

    /**
     * @notice Changes the transferability of this token.
     * @dev When the transfer is not enabled, only those in allowedTransferee array can
     * transfer this token.
     */
    function enableTransfer() external {
        require(paused(), "SDL: transfer is enabled");
        uint256 unpauseAfter = msg.sender == governance
            ? govCanUnpauseAfter
            : anyoneCanUnpauseAfter;
        require(
            block.timestamp > unpauseAfter,
            "SDL: cannot enable transfer yet"
        );
        _unpause();
    }

    /**
     * @notice Add the given addresses to the list of allowed addresses that can transfer during paused period.
     * Governance will add auxiliary contracts to the allowed list to facilitate distribution during the paused period.
     * @param targets Array of addresses to add
     */
    function addToAllowedList(address[] memory targets)
        external
        onlyGovernance
    {
        for (uint256 i = 0; i < targets.length; i++) {
            allowedTransferee[targets[i]] = true;
            emit Allowed(targets[i]);
        }
    }

    /**
     * @notice Remove the given addresses from the list of allowed addresses that can transfer during paused period.
     * @param targets Array of addresses to remove
     */
    function removeFromAllowedList(address[] memory targets)
        external
        onlyGovernance
    {
        for (uint256 i = 0; i < targets.length; i++) {
            allowedTransferee[targets[i]] = false;
            emit Disallowed(targets[i]);
        }
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);
        require(!paused() || allowedTransferee[from], "SDL: paused");
        require(to != address(this), "SDL: invalid recipient");
    }

    /**
     * @notice Transfers any stuck tokens or ether out to the given destination.
     * @dev Method to claim junk and accidentally sent tokens. This will be only used to rescue
     * tokens that are mistakenly sent by users to this contract.
     * @param token Address of the ERC20 token to transfer out. Set to address(0) to transfer ether instead.
     * @param to Destination address that will receive the tokens.
     * @param balance Amount to transfer out. Set to 0 to select all available amount.
     */
    function rescueTokens(
        IERC20 token,
        address payable to,
        uint256 balance
    ) external onlyGovernance {
        require(to != address(0), "SDL: invalid recipient");

        if (token == IERC20(address(0))) {
            // for Ether
            uint256 totalBalance = address(this).balance;
            balance = balance == 0
                ? totalBalance
                : Math.min(totalBalance, balance);
            require(balance > 0, "SDL: trying to send 0 ETH");
            // slither-disable-next-line arbitrary-send
            (bool success, ) = to.call{value: balance}("");
            require(success, "SDL: ETH transfer failed");
        } else {
            // any other erc20
            uint256 totalBalance = token.balanceOf(address(this));
            balance = balance == 0
                ? totalBalance
                : Math.min(totalBalance, balance);
            require(balance > 0, "SDL: trying to send 0 balance");
            token.safeTransfer(to, balance);
        }
    }
}
