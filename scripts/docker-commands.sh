#!/bin/sh
# create subshell to wait as the local contract network spins up, then deploy the token to the network
(sleep 60 && cd saddle-token && npx hardhat deploy --network localhost;) & \
npm run start;