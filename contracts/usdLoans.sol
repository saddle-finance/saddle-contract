// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISwap.sol";
import "./LPToken.sol";

contract usdLoans is ERC20Burnable, Ownable {
    using SafeMath for uint256;

    constructor() ERC20("oneUSD", "oUSD") public {}

    

    mapping(address => bool) lpRegistry;
    mapping(address => bool) swapRegistry;

    struct userLoan {
        uint nonce;

        uint LPL;

        uint claimedUsd;

        uint timer;
    }

    mapping(address => userLoan) userLoans;

    uint256 private constant TIMELOCK3 = 14 days;

    address payable thy;

    function setThy(address payable _thy) internal onlyOwner{
       thy = _thy;
  }

    function setRegistrys(address _lpRegistry, address _swapRegistry) internal onlyOwner{
       lpRegistry[_lpRegistry] = true;
       swapRegistry[_swapRegistry] = true;
    }

    function RequestLoan(address _LPToken, address _ISwap, uint lplock) public{
        require(lpRegistry[_LPToken] && swapRegistry[_ISwap]);
        uint lpBalance = LPToken(_LPToken).balanceOf(msg.sender);
        require(lplock <= lpBalance && lplock != 0);
        //calculate virtual price
       

        uint virtualPrice = ISwap(_ISwap).getVirtualPrice();
        //move lp tokens with approve() + transferfrom()
        LPToken(_LPToken).approve(thy, lplock);
        LPToken(_LPToken).transferFrom(msg.sender, thy, lplock);

        //update struct inside of mapping
        
        userLoans[msg.sender].LPL = lplock;
        userLoans[msg.sender].timer = block.timestamp;
        userLoans[msg.sender].nonce = userLoans[msg.sender].nonce ++;
        
        uint claimUSD = lplock * virtualPrice;

        //mint USD

       
        _mint(msg.sender, claimUSD);

        //update mapping
        userLoans[msg.sender].claimedUsd = claimUSD;
  }


    function repayLoan(address _LPToken, address _ISwap, uint repayAmount) public { 
        require(lpRegistry[_LPToken] && swapRegistry[_ISwap], "The address you try to use is currently not registered");
        require(userLoans[msg.sender].timer >= TIMELOCK3);
        require(repayAmount <= userLoans[msg.sender].LPL);
        require(userLoans[msg.sender].nonce != 0 && userLoans[msg.sender].nonce == 1);
        require(repayAmount <= userLoans[msg.sender].claimedUsd);

        if (repayAmount == userLoans[msg.sender].claimedUsd){
          burnFrom(msg.sender, repayAmount);
          LPToken(_LPToken).approve(msg.sender, userLoans[msg.sender].LPL);
          LPToken(_LPToken).transferFrom(thy, msg.sender, userLoans[msg.sender].LPL);
          userLoans[msg.sender].nonce = userLoans[msg.sender].nonce --;
        }
        else if (repayAmount <= userLoans[msg.sender].claimedUsd){
          uint analogy = (userLoans[msg.sender].LPL / userLoans[msg.sender].claimedUsd);
          burnFrom(msg.sender, repayAmount);
          LPToken(_LPToken).approve(msg.sender, analogy);
          LPToken(_LPToken).transferFrom(thy, msg.sender, analogy);

        }
        else {
          revert();
        }






    }

//1:Create restrictions for mint function to authorized users
//2: solve economical attack vector
//3: enable loan payment with other currencies?
//add comments again

}


 
