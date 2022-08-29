# get list of all networks from deployments dir, then remove testnets
all_networks=$(ls -d1 deployments/* | sed 's/deployments\///')
prod_networks=($(echo "${all_networks[@]}" | grep -v localhost | grep -v testnet | grep -v ropsten))

output_file="all-saddle-pools.txt"
first_pass=true
with_names=true # change to false to remove names from output
for network in "${prod_networks[@]}"; do
    metapool_name_tuples=($(node scripts/print-addresses.js --network=$network --only-pools | grep Meta | sed -E 's/^Saddle([[:alnum:]]+).*(0x.*)/\2\n\1/'))
    pool_name_tuples=($(node scripts/print-addresses.js --network=$network --only-pools | grep -v Meta | sed -E 's/^Saddle([[:alnum:]]+).*(0x.*)/\2\n\1/'))

    # skip network if pools are empty
    if [ "${#metapool_name_tuples[@]}" == "0" ] &&  [ "${#pool_name_tuples[@]}" == "0" ]; then
        continue
    fi

    # write new file if 1st network, otherwise append
    if [ $first_pass = true ]; then
        echo $network > $output_file
        first_pass=false
    else
        echo $network >> $output_file
    fi

    echo "  Metapools" >> $output_file
    for (( i=0; i < "${#metapool_name_tuples[@]}"; i+=2 )); do
        name=$(echo "${metapool_name_tuples[i+1]}" | sed 's/MetaPool//')
        address=${metapool_name_tuples[i]}
        if [ $with_names = true ]; then
            echo "    $address # $name" >> $output_file
        else
            echo "    $address" >> $output_file
        fi
    done

    echo "  Pools" >> $output_file
    for (( i=0; i < "${#pool_name_tuples[@]}"; i+=2 )); do
        name="${pool_name_tuples[i+1]}"
        address=${pool_name_tuples[i]}
        if [ $with_names = true ]; then
            echo "    $address # $name" >> $output_file
        else
            echo "    $address" >> $output_file
        fi
    done
done
