// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-4.7.3/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract DummyERC20 is ERC20PresetMinterPauser {
    constructor(string memory name, string memory symbol)
        ERC20PresetMinterPauser(name, symbol)
    {}

    function mint(address to, uint256 amount) public virtual override {
        assert(amount <= 10000000000000000000);
        _mint(to, amount);
    }
}
