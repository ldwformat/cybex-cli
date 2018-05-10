const PREFERRED_BASES = ["JADE.ETH", "JADE.BTC", "JADE.EOS", "JADE.CYB"];
function MarketPair(_base, _quote) {
  this.base = _base;
  this.quote = _quote;
}
const correctMarketPair = (symbolOfA, symbolOfB) => {
  let indexOfA = PREFERRED_BASES.indexOf(symbolOfA);
  let indexOfB = PREFERRED_BASES.indexOf(symbolOfB);
  if (
    (indexOfA > indexOfB && indexOfB > -1) ||
    (indexOfA === -1 && indexOfB !== -1)
  ) {
    return new MarketPair(symbolOfB, symbolOfA);
  } else if (
    (indexOfA < indexOfB && indexOfA > -1) ||
    (indexOfA !== -1 && indexOfB === -1)
  ) {
    return new MarketPair(symbolOfA, symbolOfB);
  }
  return new MarketPair(...[symbolOfA, symbolOfB].sort());
};

module.exports = {
  correctMarketPair
};
