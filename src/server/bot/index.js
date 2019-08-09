const Contract = require('../../contracts');
const CommitReveal = require('./CommitReveal');
const gameInit = require('./gameInit');

const FINISH_BET = true;
const MAX_FINISH_BET = 100;
const REFUND = true;

var stop = false;
var lastBlockNumber = 0;
var checkRound = {}

async function getBetForSettle() {
  try {
    var i = await Contract.get.indexOfDrawnBet();
    var bet = await Contract.get.bet(i);
    if (bet.round <= lastBlockNumber) {
      return bet;
    }
  } catch (ex) {
    // console.log(ex);
  }

  return null;
}


async function nextTick(cb) {
  try {
    if (stop) return;
    var block = await Contract.get.lastBlock();
    var blockNumber = parseInt(block.number);
    if (blockNumber <= lastBlockNumber) {
      return setTimeout(() => nextTick(cb), 100);
    }

    lastBlockNumber = blockNumber;

    var hash = '';
    var commitment = '';
    var settle = null;
    var bet = await getBetForSettle();
    if (bet) {
      if (!checkRound[bet.round]) {
        settle = await CommitReveal.getSecretForBet(bet);
        if (settle.round == 0) {
          return setTimeout(() => nextTick(cb), 100);
        }
        commitment = await CommitReveal.generateCommitment();
        hash = await Contract.nextTick(settle.round, settle.secret, commitment, MAX_FINISH_BET);
        checkRound[bet.round] = checkRound[bet.round] || 1;
      }
      else {
        checkRound[bet.round]++;
        if (process.env.CHECK_TIMEOUT == 'true' && checkRound[bet.round] > 1300) throw Error('Timeout');
        return setTimeout(() => nextTick(cb), 100);
      }
    }
    else {
      return setTimeout(() => nextTick(cb), 100);
    }

    console.log(`NextTick: ${hash}`)
    console.log('');

    if (process.env.WAIT_CONFIRM == 'true') {
      await Contract.get.checkTx(hash);
    }
    nextTick(cb);
  }
  catch (ex) {
    console.log(ex.toString());
    cb && cb(ex);
  }
}

module.exports = {
  start: (callback) => {
    stop = false;
    Contract.login({
      privateKey: process.env.PRIVATE_KEY
    }, async (err, address) => {
      if (err) return callback && callback(err);

      console.log('Connect wallet:', address);
      try {
        await gameInit();
        nextTick(callback);
        // Staker(callback);
      }
      catch (ex) {
        return callback && callback(ex);
      }
    });
  },
  stop() {
    stop = true;
  }
}