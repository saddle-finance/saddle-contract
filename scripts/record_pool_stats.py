import argparse
import json
import logging
import os
import requests

import boto3
import botocore
from web3 import Web3


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

STATS_FILE_PATH = os.environ["STATS_FILE_PATH"]
# IMPORTANT: Use checksummed addresses here
SWAP_CONTRACT_ADDRESS = os.environ["SWAP_CONTRACT_ADDRESS"]
DEPLOYMENT_BLOCK = int(os.environ["DEPLOYMENT_BLOCK"])
ADD_STATS_EVERY_N_BLOCK = int(os.environ["ADD_STATS_EVERY_N_BLOCK"])
HTTP_PROVIDER_URL = os.environ["HTTP_PROVIDER_URL"]
NEXT_BLOCK_CHECKING_INTERVAL_MINUTES = float(os.environ["NEXT_BLOCK_CHECKING_INTERVAL"])
FLEEK_KEY_ID = os.environ["FLEEK_KEY_ID"]
FLEEK_KEY = os.environ["FLEEK_KEY"]
FLEEK_BUCKET = os.environ["FLEEK_BUCKET"]

# TODO npm run build before this is accessible
SWAP_CONTRACT_ABI_PATH = "../build/artifacts/contracts/Swap.sol/Swap.json"
FLEEK_ENDPOINT = "https://storageapi.fleek.co"


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


def get_existing_stats_file_content(fleek_aws_client):
    try:
        obj = fleek_aws_client.get_object(Bucket=FLEEK_BUCKET, Key=STATS_FILE_PATH)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except fleek_aws_client.exceptions.NoSuchKey:
        logger.info("No existing file has been found.")
        return []
    except Exception as e:
        logger.error(f"Error reading existing file: {e}")
        return None


def get_fleek_client():
    return boto3.client(
        service_name="s3",
        api_version="2006-03-01",
        aws_access_key_id=FLEEK_KEY_ID,
        aws_secret_access_key=FLEEK_KEY,
        endpoint_url=FLEEK_ENDPOINT,
        region_name="us-east-1",
        config=botocore.config.Config(s3=dict(addressing_style="path")),
    )


def main(args):

    try:
        f = open(SWAP_CONTRACT_ABI_PATH)
        swap_contract_artifact = json.loads(f.read())
        swap_contract_abi = swap_contract_artifact["abi"]
    except Exception as e:
        logger.error(f"Could not load swap contract ABI: {e}")

    w3 = Web3(Web3.HTTPProvider(HTTP_PROVIDER_URL))
    fleek_aws_client = get_fleek_client()

    stats_content = get_existing_stats_file_content(fleek_aws_client)
    if stats_content is None:
        logger.error(
            "Error reading existing file. This can happen due to a"
            " Fleek outage. If it happens consistenly, delete the file "
            "from Fleek and wait for the script to regenerate the file "
            "from scratch."
        )
        return

    # Get the last block number
    if len(stats_content):
        last_block_num = stats_content[-1][BLOCK_NUMBER_IND]
    else:
        logger.info("Creating new file")
        last_block_num = DEPLOYMENT_BLOCK

    swap = w3.eth.contract(abi=swap_contract_abi, address=SWAP_CONTRACT_ADDRESS)

    next_block_num = last_block_num + ADD_STATS_EVERY_N_BLOCK
    logger.info(
        f"Next block number: {next_block_num}, current block: {w3.eth.blockNumber}"
    )

    # w3.eth.blockNumber gets updated dynamically
    while w3.eth.blockNumber > next_block_num:
        logger.info(f"Fetching data for block: {next_block_num}")

        virtual_price = swap.functions.getVirtualPrice().call(
            block_identifier=next_block_num
        )
        block_data = w3.eth.getBlock(next_block_num)
        btc_price = get_btc_price_at_timestamp_date(block_data.timestamp)
        if not btc_price:
            break

        stats_content.append([next_block_num, virtual_price, btc_price])

        # Rewrite the whole object every time, helps recover from where we left off,
        # if we're regenerating a lot of blocks and script stops due to provider
        # / rate limiting errors
        stats_bytes = json.dumps(stats_content, separators=(",", ":")).encode("utf-8")
        fleek_aws_client.put_object(
            Bucket=FLEEK_BUCKET, Key=STATS_FILE_PATH, Body=stats_bytes
        )
        logger.info(
            f"Uploaded cumulative stats to Fleek (latest block: {next_block_num})"
        )
        next_block_num += ADD_STATS_EVERY_N_BLOCK

    logger.info("Done for now.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    args = parser.parse_args()
    main(args)
