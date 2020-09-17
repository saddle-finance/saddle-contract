pragma solidity ^0.5.11;

import "@openzeppelin/contracts/ownership/Ownable.sol";

/**
 * @title OwnerPausable
 * @notice An ownable contract allows the owner to pause and unpause the
 *         contract without a delay.
 * @dev Only methods using the provided modifiers will be paused.
 */
contract OwnerPausable is Ownable {

    event Paused();
    event Unpaused();

    bool private _paused;

    constructor() public {
        _paused = false;
    }

    /**
     * @notice Returns whether the contract is paused or not
     * @return boolean value of true only when this contract is paused
     */
    function isPaused() public view returns (bool) {
        return _paused;
    }

    /**
     * @notice Pause the contract. Revert if already paused.
     */
    function pause() external onlyOwner onlyUnpaused {
        _paused = true;
        emit Paused();
    }

    /**
     * @notice Unpause the contract. Revert if already unpaused.
     */
    function unpause() external onlyOwner onlyPaused {
        _paused = false;
        emit Unpaused();
    }

    /**
     * @notice Revert if the contract is paused.
     */
    modifier onlyUnpaused() {
        require(!_paused, "Method can only be called when unpaused");
        _;
    }

    /**
     * @notice Revert if the contract is unpaused.
     */
    modifier onlyPaused() {
        require(_paused, "Method can only be called when paused");
        _;
    }
}
