pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OwnerPausable
 * @notice An ownable contract allows the owner to pause and unpause the
 *         contract without a delay.
 * @dev Only methods using the provided modifiers will be paused.
 */
contract OwnerPausable is Ownable() {

    event Paused();
    event Unpaused();

    bool paused = false;

    /**
     * @notice Pause the contract. Revert if already paused.
     */
    function pause() public onlyOwner onlyUnpaused {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpause the contract. Revert if already unpaused.
     */
    function unpause() public onlyOwner onlyPaused {
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
