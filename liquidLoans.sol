// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20BurnableUpgradeable.sol";
import "./interfaces/ISwap.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
contract liquidLoans is ERC20BurnableUpgradeable , OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    AggregatorV3Interface internal priceFeed1;
    AggregatorV3Interface internal priceFeed2;
    
    event getloan(uint interest, uint amount, address recipient, uint lpLocked, uint _price1, uint _price2);
    event repayloan(uint amount, address payee, uint lpReleased);

//those are placeholders for the real values
    address public treasury = 0xd744C8812362B9cEFe7D0D0198537F81841A9244;
    address public llUsd = 0xc6342fa08d8CA870B38F65BE8145AD196198c1ab;
    address public lpAddress = 0xBb78Eb7FB24fc954349B6190784D43E8BA276F5a;
    address public swapAddress = 0xf9c9C2A47313028D71B897fD10e9a7650FBA81Fd;
  

    struct loanUtils {
        uint256 owedBalance;
        uint256 lpLocked;
    }


    mapping (address => loanUtils) accounting;

    function initialize() initializer public {

        priceFeed1 = AggregatorV3Interface(0x10c5d4e186814493dDb805c84346Ce06980e9949);

        priceFeed2 = AggregatorV3Interface(0xA117480506E9d0a9d0fed5E87CE8A65BEE20e3Ca);
        
            
        __Ownable_init();

    }

    

       
    function mintAndLock (uint256 amount, address pool) public {

       // require ();
        
        uint256 [] memory tokenArray = ISwap(swapAddress).calculateRemoveLiquidity(amount);
        uint256 balanceA = tokenArray[1];
        uint256 balanceB = tokenArray[2];

        int256 usdPriceA = getLatestPrice1();
        int256 usdPriceB = getLatestPrice2();

        uint256 a = uint(usdPriceA);
        uint256 b = uint(usdPriceB);

        uint256 usdPrice = a.mul(balanceA).add(b).mul(balanceB).div(5).mul(4);
        uint256 usdInterest = usdPrice.div(1000);
        uint256 usdPaid = usdPrice.sub(usdInterest);
        
     
       
        IERC20Upgradeable(lpAddress).approve(address(this), amount);
        IERC20Upgradeable(lpAddress).transferFrom(msg.sender, address(this), amount);
        
//mint on spot, need to protect the erc20 contract
        accounting[msg.sender].owedBalance = usdPaid;
        accounting[msg.sender].lpLocked = amount;
        _mint(treasury, usdInterest);
        _mint(msg.sender, usdPaid);
       

        emit getloan(usdInterest, usdPaid, msg.sender, amount, a, b);

    }

    function burnAndUnlock (address token, uint256 amount) public {
       
        

        uint256 analogy = accounting[msg.sender].lpLocked.div(accounting[msg.sender].owedBalance);

        if (token == llUsd) {
            uint256 LpToRelease = amount.mul(analogy);
            accounting[msg.sender].owedBalance = accounting[msg.sender].owedBalance.sub(amount);
            accounting[msg.sender].lpLocked = accounting[msg.sender].lpLocked.sub(LpToRelease);
            IERC20(llUsd).transfer(0x0000000000000000000000000000000000000000, amount);

            emit repayloan(amount, msg.sender, LpToRelease);
        } else if (token == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) { 
            int256 usdPrice = getLatestPrice1();
            uint256 uPrice = uint(usdPrice);
            uint256 converted = amount.mul(uPrice);
            uint256 LpToRelease = converted.mul(analogy);
            
            accounting[msg.sender].owedBalance = accounting[msg.sender].owedBalance.sub(converted);
            accounting[msg.sender].lpLocked = accounting[msg.sender].lpLocked.sub(LpToRelease);

            IERC20(token).transfer(address(this), converted);
            IERC20(lpAddress).transfer(msg.sender, LpToRelease);

            emit repayloan(converted, msg.sender, LpToRelease);
        }

        else if (token == 0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa) {
            int256 usdPrice = getLatestPrice2();
            uint256 uPrice = uint(usdPrice);
            uint256 converted = amount.mul(uPrice);
            uint256 LpToRelease = converted.mul(analogy);
            
            accounting[msg.sender].owedBalance = accounting[msg.sender].owedBalance.sub(converted);
            accounting[msg.sender].lpLocked = accounting[msg.sender].lpLocked.sub(LpToRelease);

            IERC20(token).transfer(address(this), converted);
            IERC20(lpAddress).transfer(msg.sender, LpToRelease);
            
            emit repayloan(converted, msg.sender, LpToRelease);
        }

        else {
            revert();
        }

        }
    


    function getLatestPrice1() public view returns (int) {
        (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
        ) = priceFeed1.latestRoundData();
    }

     function getLatestPrice2() public view returns (int) {
        (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
        ) = priceFeed2.latestRoundData();
     }

}

     




   


   


 
