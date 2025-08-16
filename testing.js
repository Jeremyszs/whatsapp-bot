const math = require('mathjs');

// Then use math.sqrt() for square roots
const result = math.sqrt(16); // returns 4
console.log(result);

// For other roots, use math.nthRoot()
const cubeRoot = math.nthRoot(27, 3); // cube root of 27 = 3
console.log(cubeRoot);

// Or use the pow function for fractional exponents
const fourthRoot = math.pow(16, 1/4); // fourth root of 16 = 2
console.log(fourthRoot);