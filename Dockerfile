# Adapted from https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
FROM node:16-alpine

ENV ALCHEMY_API="https://mainnet.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV ALCHEMY_API_ROPSTEN="https://ropsten.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV MNEMONIC_TEST_ACCOUNT="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

# Create app directory
ENV ROOT /usr/src/app
WORKDIR ${ROOT}

# Copy all files and config
COPY . .

RUN apk add --update --no-cache git make python3 gcc g++
RUN git config --global --replace-all url."https://github.com/".insteadOf ssh://git@github.com/
RUN npm ci --legacy-peer-deps

# Bundle app source
COPY . .

EXPOSE 8545

CMD [ "npm", "run", "start" ]
