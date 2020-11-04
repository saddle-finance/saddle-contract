pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "./interfaces/ISwap.sol";

contract VirtualToken is ERC20, ERC20Detailed, ERC20Burnable {

    bool private initialized;
    IVirtualSynth vsynth;
    ISwap swap;
    uint8 tokenFromIndex;
    uint8 tokenToIndex;

    constructor (IVirtualSynth vsynth_, ISwap swap_, uint8 tokenFromIndex_, uint8 tokenToIndex_, string memory name_, string memory symbol_, uint8 decimals_
    ) public ERC20Detailed(name_, symbol_, decimals_) {
        vsynth = vsynth_;
        swap = swap_;
        tokenFromIndex = tokenFromIndex_;
        tokenToIndex = tokenToIndex_;
    }

    function initialize(address mintTo, uint256 mintAmount) external {
        require(!initialized);
        _mint(mintTo, mintAmount);
        initialized = true;
    }

    function balanceOfUnderlying(address account) public view returns (uint) {
        return swap.getToken(tokenToIndex).balanceOf(address(this)).mul(balanceOf(account)).div(totalSupply());
    }

    function readyToSettle() public view returns (bool) {
        return vsynth.readyToSettle();
    }

    function settle(address account) external {

        // If vsynth is ready to settle, tr settling.
        if (vsynth.readyToSettle()) {
            vsynth.settle(address(this));
        }

        // Check vsynth is settled
        require(vsynth.settled());

        // If this contract holds any synth, swap it to the desired token
        IERC20 synth = IERC20(address(vsynth.synth()));
        uint256 synthBalance = synth.balanceOf(address(this));
        if (synthBalance > 0) {
            synth.approve(address(swap), synth.balanceOf(address(this)));
            swap.swap(tokenFromIndex, tokenToIndex, synth.balanceOf(address(this)), 0, block.timestamp);
        }

        // Transfer respective amount of desired token to `account` and burn its virtual token
        swap.getToken(tokenToIndex).transfer(account, balanceOfUnderlying(account));
        _burn(account, balanceOf(account));
    }
}
