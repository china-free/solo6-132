function calc() {
  const price = 100 * 0.85;
  const tax = price * 0.13;
  return price + tax + 15;
}

module.exports = { calc };
