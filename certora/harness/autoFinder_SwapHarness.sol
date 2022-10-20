pragma solidity ^0.6.0;

import 'D:/workspaces/programming/saddle-finance/saddle-contract/certora/munged/autoFinder_Swap.sol';

// This is the contract that is actually verified; it may contain some helper
// methods for the spec to access internal state, or may override some of the
// more complex methods in the original contract.
contract SwapHarness is Swap {
    //LPToken public lpToken = swapStorage.lpToken;
    function inRampA() public view returns (bool) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00170000, 1037618708503) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00170001, 0) }
        return (block.timestamp >= swapStorage.initialATime &&
                block.timestamp < swapStorage.futureATime &&
                swapStorage.initialA != swapStorage.futureA);
    }

    function getPooledTokenAddress(uint256 index) public view returns (address) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00150000, 1037618708501) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00150001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00151000, index) }
        return address(getToken(uint8(index)));
    }

    function getSwapFee() public view returns(uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00160000, 1037618708502) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00160001, 0) }
        return swapStorage.swapFee;
    }

    function getAdminFee() public view returns(uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff000e0000, 1037618708494) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff000e0001, 0) }
        return swapStorage.adminFee;
    }

    function getTotalSupply() public view returns(uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00120000, 1037618708498) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00120001, 0) }
        return swapStorage.lpToken.totalSupply();
    }

    function getMaxAdminFee() public view returns(uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff000f0000, 1037618708495) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff000f0001, 0) }
        return SwapUtils.MAX_ADMIN_FEE;
    }

    function getMaxSwapFee() public view returns(uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00190000, 1037618708505) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00190001, 0) }
        return SwapUtils.MAX_SWAP_FEE;
    }

}
