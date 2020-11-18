pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "./interfaces/ISwap.sol";

// TODO Add NatSpec tags
contract VirtualToken is ERC20, ERC20Detailed, ERC20Burnable {

    bool private _initialized;
    bool private _settled;
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
        require(!_initialized, "Can only initialize once");
        _mint(mintTo, mintAmount);
        _initialized = true;
    }

    function balanceOfUnderlying(address account) public view returns (uint) {
        return swap.getToken(tokenToIndex).balanceOf(address(this)).mul(balanceOf(account)).div(totalSupply());
    }

    function readyToSettle() public view returns (bool) {
        return vsynth.readyToSettle();
    }

    function settled() public view returns (bool) {
        return _settled;
    }

    function _settle() internal {
        // Ensure virtual synth is ready to settle.
        require(vsynth.readyToSettle(), "Virtual Synth is not ready to settle yet.");

        // If virtual synth is not settled, try settling it.
        if (!vsynth.settled()) {
            vsynth.settle(address(this));
        }

        // If this contract holds any synth, swap it to the desired token
        IERC20 synth = IERC20(address(vsynth.synth()));
        uint256 synthBalance = synth.balanceOf(address(this));
        if (synthBalance > 0) {
            synth.approve(address(swap), synthBalance);
            swap.swap(tokenFromIndex, tokenToIndex, synthBalance, 0, block.timestamp);
        }
    }

    function settle(address account) external {
        _settle();

        // Transfer respective amount of desired token to `account` and burn its virtual token
        swap.getToken(tokenToIndex).transfer(account, balanceOfUnderlying(account));
        _burn(account, balanceOf(account));
    }
}
