# 1. print all pool addresses, filter by metapools, capture names and addresses
# 2. for each address, fetch libraries from etherscan, filter down to metaswaputils
metapools=($(node scripts/print-addresses.js --network=$1 --only-pools | grep Meta | sed -E 's/^Saddle([[:alnum:]]+).*(0x.*)/\1 \2/'))
echo "Network: $1"

# use a trick to count by twos for name and address
for (( i=0; i < "${#metapools[@]}"; i+=2 )); do 
  name="${metapools[i]}"
  addr="${metapools[i+1]}"
  result=$(node scripts/etherscan.js --network=$1 --contract=$addr --action=getContractLibraries | jq -r '.[keys[0]].MetaSwapUtils')
  echo "$name"
  echo "Address: $addr, MetaSwapUtils: $result"
done