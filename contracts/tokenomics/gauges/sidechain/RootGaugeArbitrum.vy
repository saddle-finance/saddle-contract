# @version 0.3.1
"""
@title Root-Chain Gauge
@author Curve Finance
@license MIT
@notice Calculates total allocated weekly SDL emission
        mints and sends across a sidechain bridge
"""

from vyper.interfaces import ERC20

interface Controller:
    def period() -> int128: view
    def gauge_relative_weight(addr: address, time: uint256) -> uint256: view
    def checkpoint(): nonpayable
    def checkpoint_gauge(addr: address): nonpayable

interface Minter:
    def token() -> address: view
    def controller() -> address: view
    def minted(user: address, gauge: address) -> uint256: view
    def mint(gauge: address): nonpayable
    def start_epoch_time_write() -> uint256: nonpayable
    def rate() -> uint256: view
    def committed_rate() -> uint256: view


event PeriodEmission:
    period_start: uint256
    mint_amount: uint256

event CommitOwnership:
    admin: address

event ApplyOwnership:
    admin: address

event FeesModified:
    gas_limit: uint256
    gas_price: uint256
    max_submission_cost: uint256


## BRIDGE AND L2 POOL SPECIFIC CONSTANTS 
GATEWAY_ROUTER: constant(address) = 0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef
GATEWAY: constant(address) = 0xa3A7B6F88361F48403514059F1F16C8E78d60EeC
NAME: immutable(String[64])

MINTER: immutable(address)

WEEK: constant(uint256) = 604800
YEAR: constant(uint256) = 86400 * 365
RATE_DENOMINATOR: constant(uint256) = 10 ** 18
RATE_REDUCTION_TIME: constant(uint256) = 2 * WEEK



minter: public(address)
sdl_token: public(address)
controller: public(address)
start_epoch_time: public(uint256)

period: public(uint256)
emissions: public(uint256)
inflation_rate: public(uint256)

admin: public(address)
future_admin: public(address)  # Can and will be a smart contract
is_killed: public(bool)

checkpoint_admin: public(address)

# L2 transaction costs `max_submission_cost + (gas_limit * gas_price)`
gas_limit: public(uint256)
gas_price: public(uint256)
max_submission_cost: public(uint256)

@external
def __init__(
    _minter: address,
    _admin: address,
    _lp_symbol: String[26],
    _gas_limit: uint256,
    _gas_price: uint256,
    _max_submission_cost: uint256
):
    """
    @notice Contract constructor
    @param _minter Minter contract address
    @param _admin Admin who can kill the gauge
    @param _lp_symbol Symbol of the associated LP token on the side chain
    @param _gas_limit Gas limit for L2 bridge tx (recommended 1000000)
    @param _gas_price Gas price for L2 bridge tx (recommended 990000000)
    @param _max_submission_cost Max submission cost for L2 bridge tx (recommended 10000000000000)
    """

    sdl_token: address = Minter(_minter).token()

    MINTER = _minter
    self.admin = _admin
    self.sdl_token = sdl_token
    self.controller = Minter(_minter).controller()
    name: String[64] = concat("Saddle ", _lp_symbol, " Root Gauge (Arbitrum)")
    NAME = name

    # because we calculate the rate locally, this gauge cannot
    # be used prior to the start of the first emission period
    rate: uint256 = Minter(_minter).rate()
    assert rate != 0
    self.inflation_rate = rate

    self.period = block.timestamp / WEEK - 1
    self.start_epoch_time = Minter(_minter).start_epoch_time_write()

    self.gas_limit = _gas_limit
    self.gas_price = _gas_price
    self.max_submission_cost = _max_submission_cost

    ERC20(sdl_token).approve(GATEWAY, MAX_UINT256)


@view
@external
def get_total_bridge_cost() -> uint256:
    """
    @notice Get the required Ether amount when calling `checkpoint`
    """
    return self.gas_price * self.gas_limit + self.max_submission_cost


@payable
@external
def checkpoint() -> bool:
    """
    @notice Mint all allocated SDL emissions and transfer across the bridge
    @dev Should be called once per week, after the new epoch period has begun.
         This function is payable to allow forwarding the required ETH for
         the transaction to be processed on the layer2 side. You can check the
         required ETH value for the tx by calling `get_total_bridge_cost`.
    """
    assert self.checkpoint_admin in [ZERO_ADDRESS, msg.sender]
    last_period: uint256 = self.period
    current_period: uint256 = block.timestamp / WEEK - 1

    if last_period < current_period:

        controller: address = self.controller
        Controller(controller).checkpoint_gauge(self)

        # Use current reward rate (may be decreased during the period if the period crosses an epoch)
        rate: uint256 = Minter(MINTER).rate()
        self.inflation_rate = rate

        new_emissions: uint256 = 0
        last_period += 1
        next_epoch_time: uint256 = self.start_epoch_time + RATE_REDUCTION_TIME
        for i in range(last_period, last_period + 255):
            if i > current_period:
                break
            period_time: uint256 = i * WEEK
            period_emission: uint256 = 0
            gauge_weight: uint256 = Controller(controller).gauge_relative_weight(self, i * WEEK)

            if next_epoch_time >= period_time and next_epoch_time < period_time + WEEK:
                # If the period crosses an epoch, we calculate a reduction in the rate
                # using commited_rate. Because we are generating the emissions for the upcoming week, 
                # so there is a possibility the new rate has not yet been applied.
                period_emission = gauge_weight * rate * (next_epoch_time - period_time) / 10**18
                # If no new rate is commited to Minter contract, use the current rate
                new_rate: uint256 = Minter(MINTER).committed_rate()
                if (new_rate == MAX_UINT256):
                    new_rate = rate
                period_emission += gauge_weight * rate * (period_time + WEEK - next_epoch_time) / 10**18

                self.start_epoch_time = next_epoch_time
                next_epoch_time += RATE_REDUCTION_TIME
            else:
                period_emission = gauge_weight * rate * WEEK / 10**18

            log PeriodEmission(period_time, period_emission)
            new_emissions += period_emission

        self.period = current_period
        self.emissions += new_emissions
        if new_emissions > 0 and not self.is_killed:
            max_submission_cost: uint256 = self.max_submission_cost
            gas_price: uint256 = self.gas_price
            gas_limit: uint256 = self.gas_limit
            sdl_token: address = self.sdl_token

            Minter(MINTER).mint(self)

            token: address = sdl_token
            to: address = self
            amount: uint256 = new_emissions
            maxGas: uint256 = gas_limit
            gasPriceBid: uint256 = gas_price

            # After bridging, the SDL should arrive on Arbitrum within 10 minutes. If it
            # does not, the L2 transaction may have failed due to an insufficient amount
            # within `max_submission_cost + (gas_limit * gas_price)`
            # In this case, the transaction can be manually broadcasted on Arbitrum by calling
            # `ArbRetryableTicket(0x000000000000000000000000000000000000006e).redeem(redemption-TxID)`
            # The calldata for this manual transaction is easily obtained by finding the reverted
            # transaction in the tx history for 0x000000000000000000000000000000000000006e on Arbiscan.
            # https://developer.offchainlabs.com/docs/l1_l2_messages#retryable-transaction-lifecycle
            
            # childChainStreamer on Arbitrum will be at the same address as this contract,
            # hence sending to 'self' on the Arbitrum side
            raw_call(
                GATEWAY_ROUTER,
                _abi_encode(
                    token,
                    to, 
                    amount,
                    maxGas,
                    gasPriceBid,
                    _abi_encode(max_submission_cost, b""),
                    method_id=method_id("outboundTransfer(address,address,uint256,uint256,uint256,bytes)")
                ),
                value=gas_price * gas_limit + max_submission_cost
            )

    return True


@view
@external
def future_epoch_time() -> uint256:
    return self.start_epoch_time + RATE_REDUCTION_TIME


@view
@external
def user_checkpoint(addr: address) -> bool:
    return True


@view
@external
def integrate_fraction(addr: address) -> uint256:
    assert addr == self, "Gauge can only mint for itself"
    return self.emissions


@external
def set_killed(_is_killed: bool):
    """
    @notice Set the killed status for this contract
    @dev When killed, the gauge always yields a rate of 0 and so cannot mint SDL
    @param _is_killed Killed status to set
    """
    assert msg.sender == self.admin  # dev: admin only

    self.is_killed = _is_killed


@external
def commit_transfer_ownership(addr: address):
    """
    @notice Transfer ownership of GaugeController to `addr`
    @param addr Address to have ownership transferred to
    """
    assert msg.sender == self.admin  # dev: admin only

    self.future_admin = addr
    log CommitOwnership(addr)


@external
def accept_transfer_ownership():
    """
    @notice Accept a pending ownership transfer
    """
    _admin: address = self.future_admin
    assert msg.sender == _admin  # dev: future admin only

    self.admin = _admin
    log ApplyOwnership(_admin)


@external
def set_checkpoint_admin(_admin: address):
    """
    @notice Set the checkpoint admin address
    @dev Setting to ZERO_ADDRESS allows anyone to call `checkpoint`
    @param _admin Address of the checkpoint admin
    """
    assert msg.sender == self.admin  # dev: admin only

    self.checkpoint_admin = _admin

@view
@external
def name() -> String[64]:
  """
  @notice Get the name for this gauge
  """
  return NAME
