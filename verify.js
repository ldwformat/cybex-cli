// const winners = require("./winner-list");
const winners = require("./game/to_send_0306.json");
const gameWinners = require("./final.json");
const xn = require("./xn_final.1.json");

let gameCodes = gameWinners.map(person => person[3]);
let xnCodes = xn.map(x => x.code);

let codes = [...gameCodes, ...xnCodes];
// console.log("codes:", codes);
for (let winner of winners) {
  // console.log("Winner: ", winner);
  let [name, code] = winner;
  if (codes.indexOf(code) === -1) {
    console.log(code);
  }
}
console.log("Total Winners: ", winners.length);
module.exports = {
  winners: winners.filter(winner => winner[1].startsWith("CYBEX"))
}