pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../munged/Swap.sol";

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract SwapHarness is Swap {
    // TODO: add public `initialized` field
    // TODO: add public 'inARamp' field
}
