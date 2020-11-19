pragma solidity 0.5.17;

import "@openzeppelin/contracts/ownership/Ownable.sol";

/**
 * @title OwnerPausable
 * @notice An ownable contract allows the owner to pause and unpause the
 * contract without a delay.
 * @dev Only methods using the provided modifiers will be paused.
 */
contract OwnerPausable is Ownable {

    event Paused();
    event Unpaused();

    bool private paused = false;

    /**
     * @notice Pause the contract. Revert if already paused.
     */
    function pause() external onlyOwner onlyUnpaused {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpause the contract. Revert if already unpaused.
     */
    function unpause() external onlyOwner onlyPaused {
        paused = false;
        emit Unpaused();
    }


    /**
     * @notice Revert if the contract is paused.
     */
    modifier onlyUnpaused() {
        require(!paused, "Method can only be called when unpaused");
        _;
    }

    /**
     * @notice Revert if the contract is unpaused.
     */
    modifier onlyPaused() {
        require(paused, "Method can only be called when paused");
        _;
    }
}
