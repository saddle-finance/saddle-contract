// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts-4.2.0/access/Ownable.sol";

contract SmartWalletChecker is Ownable {
    bool public isWhitelistEnabled;
    mapping(address => bool) public wallets;
    address public checker;
    address public future_checker;

    event ApproveWallet(address);
    event RevokeWallet(address);
    event WhitelistEnabled(bool);

    constructor(bool _isWhitelistEnabled) public Ownable() {
        // Set state variables
        setIsWhitelistEnabled(_isWhitelistEnabled);
    }

    function commitSetChecker(address _checker) external onlyOwner {
        future_checker = _checker;
    }

    function applySetChecker() external onlyOwner {
        checker = future_checker;
    }

    function approveWallet(address _wallet) external onlyOwner {
        wallets[_wallet] = true;

        emit ApproveWallet(_wallet);
    }

    function revokeWallet(address _wallet) external onlyOwner {
        wallets[_wallet] = false;

        emit RevokeWallet(_wallet);
    }

    function setIsWhitelistEnabled(bool _isWhitelistEnabled) public onlyOwner {
        isWhitelistEnabled = _isWhitelistEnabled;

        emit WhitelistEnabled(_isWhitelistEnabled);
    }

    function check(address _wallet) external view returns (bool) {
        if (!isWhitelistEnabled) {
            return true;
        }

        bool _check = wallets[_wallet];
        if (_check) {
            return _check;
        } else {
            if (checker != address(0)) {
                return SmartWalletChecker(checker).check(_wallet);
            }
        }
        return false;
    }
}
