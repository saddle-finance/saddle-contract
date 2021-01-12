import argparse
import json
import logging
import requests
import time

import ipfshttpclient
from web3 import Web3


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

SWAP_CONTRACT_ABI_PATH = "../build/artifacts/contracts/Swap.sol/Swap.json"
STATS_FILE_PATH = "pool-stats.json"

# Mainnet
# Use checksummed addresses here
SWAP_CONTRACT_ADDRESS_MAINNET = ""
# TODO: Change once deployed
DEPLOYMENT_BLOCK_MAINNET = 0
# Setting at once ~2hr for now
ADD_STATS_EVERY_N_BLOCK = 550
NEXT_BLOCK_CHECKING_INTERVAL = 10

# Development
SWAP_CONTRACT_ADDRESS_DEV = "0x851356ae760d987E095750cCeb3bC6014560891C"
DEPLOYMENT_BLOCK_DEV = 40
HTTP_PROVIDER_URL_DEV = "http://127.0.0.1:8545"
ADD_STATS_EVERY_N_BLOCK_DEV = 2
NEXT_BLOCK_CHECKING_INTERVAL_DEV = 0.02

# Add timestamp, A, adminfee, swapfee in the future?
BLOCK_NUMBER_IND = 0
VIRTUAL_PRICE_IND = 1
BTC_PRICE_IND = 2


def get_btc_price_at_timestamp_date(ts):
    try:
        end_ts = ts
        start_ts = ts - 60 * 60
        url = (
            f"https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/"
            f"range?vs_currency=usd&from={start_ts}&to={end_ts}"
        )
        price_info = requests.get(url).json()
        prices = price_info["prices"]
        return prices[-1][1]
    except Exception as e:
        logger.error(f"Could not fetch btc price at {ts}: {e}")


def get_existing_stats_file_content():
    stats_content = []
    try:
        with open(STATS_FILE_PATH, "r") as stats_file:
            try:
                stats_content_str = stats_file.read()
                if stats_content_str:
                    stats_content = json.loads(stats_content_str)
            except Exception as e:
                logger.error(f"Could not parse stats_content_str: {e}")
    except FileNotFoundError:
        pass

    return stats_content


def main(args):
    ipfs = ipfshttpclient.connect()

    try:
        f = open(SWAP_CONTRACT_ABI_PATH)
        swap_contract_artifact = json.loads(f.read())
        swap_contract_abi = swap_contract_artifact["abi"]
    except Exception as e:
        logger.error(f"Could not load swap contract ABI: {e}")

    if args.dev:
        contract_addr = SWAP_CONTRACT_ADDRESS_DEV
        w3_client = Web3(Web3.HTTPProvider(HTTP_PROVIDER_URL_DEV))
        deployment_block = DEPLOYMENT_BLOCK_DEV
        stats_every_n_block = ADD_STATS_EVERY_N_BLOCK_DEV
        loop_sleep_min = NEXT_BLOCK_CHECKING_INTERVAL_DEV
    else:
        contract_addr = SWAP_CONTRACT_ADDRESS_MAINNET
        deployment_block = DEPLOYMENT_BLOCK_MAINNET
        stats_every_n_block = ADD_STATS_EVERY_N_BLOCK
        loop_sleep_min = NEXT_BLOCK_CHECKING_INTERVAL
        from web3.auto.infura import w3

        w3_client = w3

    stats_content = get_existing_stats_file_content()

    # Get the last block number
    if len(stats_content):
        last_block_num = stats_content[-1][BLOCK_NUMBER_IND]
    else:
        last_block_num = deployment_block

    swap = w3_client.eth.contract(abi=swap_contract_abi, address=contract_addr)

    next_block_num = last_block_num + stats_every_n_block
    while True:
        # This gets updated dynamically. Wait until the target next block...
        current_block = w3_client.eth.blockNumber
        if current_block < next_block_num:
            logger.info(
                f"Curent block {current_block}, waiting {loop_sleep_min}"
                f" minutes until block {next_block_num}..."
            )
            time.sleep(loop_sleep_min * 60)
            continue

        logger.info(f"Fetching data for block: {next_block_num}")

        virtual_price = swap.functions.getVirtualPrice().call(
            block_identifier=next_block_num
        )
        block_data = w3_client.eth.getBlock(next_block_num)
        btc_price = get_btc_price_at_timestamp_date(block_data.timestamp)
        if not btc_price:
            break

        stats_content.append([next_block_num, virtual_price, btc_price])

        # Rewrite the whole file every time, helps recover from where we left off,
        # if we're regenerating a lot of blocks and script stops due to provider
        # and rate limiting errors
        with open(STATS_FILE_PATH, "w") as stats_file:
            stats_file.write(json.dumps(stats_content, separators=(",", ":")))

        next_block_num += stats_every_n_block
        res = ipfs.add(STATS_FILE_PATH)
        logger.info(f"Uploaded to IPFS: {res}")

        # TODO: Set a fixed http URL to this IPFS hash


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dev", help="development mode", action="store_true")
    args = parser.parse_args()
    main(args)
