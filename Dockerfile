# Adapted from https://nodejs.org/en/docs/guides/nodejs-docker-webapp/

FROM node:12.22.1-alpine3.10

ENV ALCHEMY_API="https://mainnet.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV ALCHEMY_API_ROPSTEN="https://ropsten.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV MNEMONIC_TEST_ACCOUNT="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

# Create app directory
WORKDIR /usr/src/app

RUN apk add --update --no-cache git
RUN apk add --update python make g++\
   && rm -rf /var/cache/apk/*

RUN git clone -b deploySDL --single-branch --depth=1 "https://github.com/saddle-finance/saddle-token.git"
COPY . .
RUN git config --global --replace-all url."https://github.com/".insteadOf ssh://git@github.com/
RUN npm ci

# install saddle-token repo deps
WORKDIR /usr/src/app/saddle-token
RUN npm ci

WORKDIR /usr/src/app
RUN npm run build

EXPOSE 8545

RUN [ "chmod", "+x", "scripts/docker-commands.sh" ]
CMD [ "scripts/docker-commands.sh" ]
