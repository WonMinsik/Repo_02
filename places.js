var path = require('path');
var fs = require('fs');

const rawdata = fs.readFileSync('./places.json');
var places = JSON.parse(rawdata).places;

places.push({"name":"e2sTest","space":1, "ip":{"0":"211.47.190.69"}})
//places.push({"name":"테스트장비","space":1, "ip":{"0":"127.0.0.1"}})
//places.push({"name":"미르시스템","space":1, "ip":{"0":"58.150.152.152"}})

// console.log(places);

module.exports = places;