// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./interfaces/IERC20.sol";
import "./interfaaces/ISwap.sol";
import "./interfaces/IPoolRegistry.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./PriceConsumerV3.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract liquidLoans is ownable is ERC20{


    using SafeMath for uint256;

   
        //SUSD - USD
    priceFeed1;
        //USDC - USD
    priceFeed2;
        //FRAX - USD
    priceFeed3;
        //FEI - USD
    priceFeed4;
        //LUSD - USD
 //    priceFeed5 = AggregatorV3Interface(0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0);

    

interface AggregatorV3Interface {

  

  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );

}



    

    event getloan;
    interest, amount, recipient
    event repayloan;
    event addPool;
    event removePool;
    event getPrice;


    address treasury public = 0x0;
  

    struct poolData {
        mapping (address => uint) borrowers;
        bool exists;
        bool isRemoved;
        uint totalMintable;
        address lpTokenPair;
    }

    
    mapping (address => poolData) accounting;

    function initialize(address price1, address price2, address price3, address price4) initializer public {
        priceFeed1 = AggregatorV3Interface(price1);
        priceFeed2 = AggregatorV3Interface(price2);
       

        
        __Ownable_init();

    }

    

       
    function mintAndLock (address _to, uint256 amount, address pool, address lpToken) public {
        require (borrowers[pool].exists[true] && !borrowers[pool].isRemoved[false]);
        
        uint256 [a, b] = pool.calculateRemoveLiquidity(amount);
        uint256 usdPriceA = getLatestPrice1();
        uint256 usdPriceB = getLatestPrice2();
        uint256 usdPrice = usdPriceA.mul(a).add(usdPriceB).mul(b).div(5).mul(4);
        uint256 usdInterest = usdPrice.div(1000);
        uint256 usdPaid = usdPrice.sub(usdInterest);
        
        balances[_to] = balances[_to].add(usdPrice);
        balances[treasury] = balances[treasury].add(usdInterest);
        LPToken(lpToken).approve(treasury, amount);
        LPToken(lpToken).transferFrom(msg.sender, treasury, amount);
        accounting[pool].borrowers[msg.sender] = usdPaid;
        _mint(treasury, usdInterest);
        _mint(msg.sender, usdPaid);

    }

    function burnAndUnlock (address _to, uint256 amount, address pool, address lpToken) public {
        balances[_from] -= _amount;
    }

    //add pool to the authorised addresses
    //bool add or remove
//when add pool calculate remove liquidity and get the usd price for each token
    function addPool (address pool, bool add){
        if (add == true) { 
            accounting[pool] = exists[true]; }
        if (add == false){
            accounting[pool] = isRemoved[true];
        }
        else {
            revert();
        }
    }

   

    function getLatestPrice1(uint []) public view returns (int) {
        (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
        ) = priceFeed1.latestRoundData();
    }

     function getLatestPrice2(uint []) public view returns (int) {
        (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
        ) = priceFeed2.latestRoundData();
     }

}




   


   


 
