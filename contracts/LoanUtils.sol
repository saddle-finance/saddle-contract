//SPDX: MIT

pragma solidity 0.6.12;

//import "./oUSD.sol";
import "@openzeppelin/contracts@3.3.0/access/Ownable.sol";
import "@openzeppelin/contracts@3.3.0/math/SafeMath.sol";
import "./interfaces/ISwap.sol";

import "./LPToken.sol";

//import ierc receiver?



contract loanUtils is Ownable {


  struct userLoan {
      uint nonce;

      uint LPL;

      uint timelocked;
  }


  mapping(address => userLoan) userLoans;

    //Timelockperiods corresponding to % of stablecoin balance release 10-80%

  uint256 private constant TIMELOCK1 = 3 days;

  uint256 private constant TIMELOCK2 = 7 days;

  uint256 private constant TIMELOCK3 = 14 days;

  uint256 private constant TIMELOCK4 = 21 days;

  uint256 private constant TIMELOCK5 = 28 days;

  uint256 private constant TIMELOCK6 = 90 days;

  uint256 private constant TIMELOCK7 = 180 days;

  uint256 private constant TIMELOCK8 = 360 days;

//Each authorized Pool can get its address here
  address LPToken1;

  address UsdContract;

  address swapContract;


  //set addresses for contracts

  function setAdressSwap(address _swapContract) internal onlyOwner {
        swapContract = _swapContract;
  }

  function setAddressLP(address _LPToken1) internal onlyOwner{
        LPToken1 = _LPToken1;
    }

  function setAddressUsd(address _usdcontract) internal onlyOwner{
        UsdContract = _usdcontract;
    }
  //calls virtual price from ISwap interface
  function callVirtualPrice(address account) external view returns (uint256){
        ISwap iswap = ISwap(swapContract);
        return ISwap.getVirtualPrice(account);
  }
  //Gets LP balance from LPToken contract
  function getLPBalance(address account) external view returns (uint256){
         LPToken lptoken = LPToken(LPToken1);
         return lptoken.balanceOf(account);
     }

//requested amount in USD
//Deposit address is checked for LP balance
//lp 
  function RequestLoan(uint requestedAmount, uint lplock, uint timeLock) public{
        lpBalance = getLPBalance(msg.sender);
        require(timelock < 9 && timelock != 0);
        require(lplock <= lpBalance && lplock != 0);
        //calculate virtual swap
        virtualPrice = callVirtualPrice(msg.sender);


        //move lp tokens with approve() + transferfrom()
        LPToken lptoken = LPToken(LPToken1);
        lptoken.approve(this, lplock);
        lptoken.transferfrom(msg.sender, this, lplock);

        //update mapping
        var userloans = userLoans[msg.sender];
        userloans.LPL = lplock;
        userloans.timelocked = ;
        userloans.nonce = ++;
        lockedLP(msg.sender) = lplock;

        
        
        // lplock * virtualPrice / 10 * timelock
        claimUSD = (lplock * virtualPrice) / (10 * timelock);

        //mint USD

        oUSD ousd = oUSD(UsdContract);
        ousd.mint(msg.sender, claimUSD);


        function repayLoan(){

        }






  }





}
