// SPDX-License-Identifier: MIT

//SPDX: MIT

pragma solidity 0.6.12;

//import "./oUSD.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/ISwap.sol";

import "./LPToken.sol";
import "./oUSD.sol";



contract loanUtils is Ownable {

// Nonce indication of the Liquid Loans a user currently holds, can only be 0 or 1 for now

// LPL = LP locked

// The amount of claimed oUSD after the LP was locked

// The block.timestamp that the user received the Liquid Loan
  struct userLoan {
      uint nonce;

      uint LPL;

      uint claimedUsd;

      uint timer;

//    uint timelimit;
  }

 
//mapping that engulfs the userLoan struct

  mapping(address => userLoan) userLoans;

  //Timelockperiods corresponding to % of stablecoin release 10-80% relevant to LPValue
  //to be implemented later, rn only the 14 days timelock is used with default 80%

  uint256 private constant TIMELOCK3 = 14 days;
/*
  uint256 private constant TIMELOCK1 = 3 days;

  uint256 private constant TIMELOCK2 = 7 days;

  

  uint256 private constant TIMELOCK4 = 21 days;

  uint256 private constant TIMELOCK5 = 28 days;

  uint256 private constant TIMELOCK6 = 90 days;

  uint256 private constant TIMELOCK7 = 180 days;

  uint256 private constant TIMELOCK8 = 360 days;
  */

//Each LPcontract authorized to participate in the LiquidLoan incentives can be added from here
  address LPToken1;

//thy payable address to receive LPTokens that are used as collateral for oUSD loans
  address payable thy;





  //set thy, to be governed with multysig
  /*address set function used because other functions from the imported contracts are not
  allowed to use <this> as a parameter*/
  function setThy(address payable _thy) internal onlyOwner{
    thy = _thy;
  }

  //Set LPToken1 address to be used in RequestLoan() and repayLoan() functions
   function setLPToken1(address _LPToken1) internal onlyOwner{
     LPToken1 = _LPToken1;
   }

   //require initialisation of setLPToken1 before Request Loan, use states

 
 


  function RequestLoan(LPToken _LPToken, ISwap _ISwap, oUSD _oUSD, uint lplock, uint timelock) public{
        uint lpBalance = _LPToken.balanceOf(msg.sender);
        require(timelock <= 8 && timelock != 0);
        require(lplock <= lpBalance && lplock != 0);
        //calculate virtual price
       

        uint virtualPrice = _ISwap.getVirtualPrice();
        //move lp tokens with approve() + transferfrom()
        _LPToken.approve(thy, lplock);
        _LPToken.transferFrom(msg.sender, thy, lplock);

        //update struct inside of mapping
        
        userLoans[msg.sender].LPL = lplock;
        userLoans[msg.sender].timer = block.timestamp;
        userLoans[msg.sender].nonce = userLoans[msg.sender].nonce ++;
        
        
        // lplock * virtualPrice / 10 * timelock
        // default 80% for now
        
        uint claimUSD = (lplock * virtualPrice / 10) * 8;

        //mint USD

       
        _oUSD.mint(msg.sender, claimUSD);

        //update mapping
        userLoans[msg.sender].claimedUsd = claimUSD;
  }


  function repayLoan(oUSD _oUSD, LPToken _LPToken, uint repayAmount) public { 
        require(userLoans[msg.sender].timer >= TIMELOCK3);
        require(repayAmount <= userLoans[msg.sender].LPL);
        require(userLoans[msg.sender].nonce != 0 && userLoans[msg.sender].nonce == 1);
        require(repayAmount <= userLoans[msg.sender].claimedUsd);
//if repayAmount is equal to claimedUsd
//burn all oUSD and unlock the LP tokens back to the user
// decrement nonce as the Loan is repaid

        if (repayAmount == userLoans[msg.sender].claimedUsd){
          _oUSD.burnFrom(msg.sender, repayAmount);
          _LPToken.approve(msg.sender, userLoans[msg.sender].LPL);
          _LPToken.transferFrom(thy, msg.sender, userLoans[msg.sender].LPL);
          userLoans[msg.sender].nonce = userLoans[msg.sender].nonce --;
//else if the repayAmount is less than the amount Loaned
//divideLocked LP tokens with claimedUSD to find the analogy at which the conversion took place at first
//then multiply with repayAmount to find the value of LPTokens that need to be unlocked
        }
        else if (repayAmount <= userLoans[msg.sender].claimedUsd){
          uint analogy = (userLoans[msg.sender].LPL / userLoans[msg.sender].claimedUsd) * repayAmount;
          _oUSD.burnFrom(msg.sender, repayAmount);
          _LPToken.approve(msg.sender, analogy);
          _LPToken.transferFrom(thy, msg.sender, analogy);
          //nonce is not decremented yet as loan is not considered fully repaid


        }
        else {
          revert();
        }






    }






  





}
