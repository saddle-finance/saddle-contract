# Adapted from https://nodejs.org/en/docs/guides/nodejs-docker-webapp/

FROM node:12.22.1-alpine3.10

ENV ALCHEMY_API="https://mainnet.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV ALCHEMY_API_ROPSTEN="https://ropsten.infura.io/v3/5f79dfc1f8194c07bf7806064bb16bf9"
ENV MNEMONIC_TEST_ACCOUNT="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./
RUN apk add --update --no-cache git
RUN git config --global --replace-all url."https://github.com/".insteadOf ssh://git@github.com/
RUN npm ci

# Bundle app source
COPY . .

RUN npm run build

EXPOSE 8545

CMD [ "npm", "run", "start" ]
