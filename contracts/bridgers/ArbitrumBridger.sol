pragma solidity 0.8.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-4.2.0/token/ERC20/utils/SafeERC20.sol";

interface IGatewayRouter {
    function setGateway(
        address _gateway,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost,
        address creditBackAddress
    ) external payable returns (uint256);
}


contract ArbitrumBridger {

    // consts
    address private constant SDL = 0xf1Dc500FdE233A4055e25e5BbF516372BC4F6871;
    address private constant ARB_GATEWAY = 0xa3A7B6F88361F48403514059F1F16C8E78d60EeC;
    address private constant ARB_GATEWAY_ROUTER = 0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef;
    uint256 private constant MAX_UINT256 = 2**256 - 1;
    address private constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;
    // vars
    uint256 private submissionData;
    mapping(address => bool) public approved;

    // owner
    address public owner;
    address public futureOwner;

    using SafeERC20 for IERC20;

    event TransferOwnership(
        address oldOwner,
        address oldOwner,
    );

    event UpdateSubmissionData(
        uint256 oldSubmissionData [3]
        uint256 newSubmissionData [3]
    );

    constructor(uint256 gasLimit, uint256 gasLimit, uint256 maxSubmissionCost) {
        // construct submission data
        self.submissionData = string(abi.encodePacked(gasLimit, gasLimit, maxSubmissionCost);
        emit UpdateSubmissionData([0,0,0], [gasLimit, gasLimit, maxSubmissionCost]);

        // approve token transfer to gateway
        address private constant SDL = 0xf1Dc500FdE233A4055e25e5BbF516372BC4F6871;
        sdlToken = IERC20(SDL);
        assert sdlToken.approve(ARB_GATEWAY, MAX_UINT256);
        approved[SDL] = True

        owner = msg.sender;
        emit TransferOwnership(ZERO_ADDRESS, msg.sender);
    }

    function bridge (address token,  address to, uint256 amount) public payable {
        assert IERC20(token).transferFrom(msg.sender, self, amount)
        if( token != SDL &&  !approved[token]){
            assert IERC20(token).approve(<get gateway router contract>, MAX_UINT256)
        }
    }
}









//     #### consts
//     arbitrum_L1_Gateway = multisig.contract(
//         "0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef"
//     )
//     amountToSendArbitrumMiniChef = ceil(8974940) * 1e18
//     gasLimitL2 = 1000000
//     gasPriceL2 = 990000000
//     maxSubmisstionCostL2 = 10000000000000
//     arbitrumMinichefAddress = MINICHEF_ADDRESSES[CHAIN_IDS["ARBITRUM"]]

//      ####  call getGateway on abrL1Gateway with SDL mainnet address to get L2 address
//     sdlGatewayAddress = arbitrum_L1_Gateway.getGateway(sdl_contract.address)
//     sdl_contract.approve(sdlGatewayAddress, amountToSendArbitrumMiniChef)
//     arb_encoded = (
//         "0x"
//         + eth_abi.encode_abi(["uint256", "bytes32[]"], [maxSubmisstionCostL2, []]).hex()
//     )

//     arbitrum_L1_Gateway.outboundTransfer(
//         sdl_contract.address,
//         arbitrumMinichefAddress,
//         amountToSendArbitrumMiniChef,
//         gasLimitL2,
//         gasPriceL2,
//         arb_encoded,
//         {"value": 1e15},
//     )