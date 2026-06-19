const fs = require('fs');
const path = require('path');

function processUserData(users) {
  const result = [];
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    
    if (user.active) {
      if (user.age > 18) {
        if (user.country === 'CN') {
          if (user.score > 60) {
            if (user.verified) {
              if (user.email) {
                const discount = user.score * 0.15;
                const bonus = 100;
                const taxRate = 0.08;
                const finalAmount = (user.amount + bonus) * (1 - taxRate) - discount;
                const maxLimit = 10000;
                const minLimit = 100;
                
                if (finalAmount > maxLimit) {
                  finalAmount = maxLimit;
                } else if (finalAmount < minLimit) {
                  finalAmount = minLimit;
                }
                
                result.push({
                  userId: user.id,
                  amount: finalAmount,
                  timestamp: Date.now()
                });
              }
            }
          }
        }
      }
    }
  }
  
  return result;
}

function calculatePrice(basePrice, quantity, category) {
  let price = basePrice * quantity;
  
  if (category === 'A') {
    price = price * 0.85;
  } else if (category === 'B') {
    price = price * 0.9;
  } else if (category === 'C') {
    price = price * 0.95;
  }
  
  if (quantity > 10) {
    price = price * 0.95;
  }
  
  if (price > 1000) {
    price = price - 50;
  }
  
  const tax = price * 0.13;
  const shipping = 15;
  
  return price + tax + shipping;
}

function generateReport(data, format, options) {
  if (!data || data.length === 0) {
    return null;
  }
  
  let result = '';
  const title = 'Report';
  const maxItems = 100;
  const pageSize = 20;
  const headerSize = 3;
  const footerSize = 2;
  
  if (format === 'json') {
    result = JSON.stringify({
      title,
      count: Math.min(data.length, maxItems),
      items: data.slice(0, maxItems),
      generatedAt: Date.now()
    }, null, 2);
  } else if (format === 'csv') {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.slice(0, maxItems).map(item => 
      Object.values(item).join(',')
    ).join('\n');
    result = headers + '\n' + rows;
  } else if (format === 'xml') {
    result = '<?xml version="1.0"?>\n<report>\n';
    result += `  <title>${title}</title>\n`;
    result += `  <count>${Math.min(data.length, maxItems)}</count>\n`;
    result += '  <items>\n';
    data.slice(0, maxItems).forEach((item, idx) => {
      result += `    <item index="${idx}">\n`;
      Object.entries(item).forEach(([key, value]) => {
        result += `      <${key}>${value}</${key}>\n`;
      });
      result += '    </item>\n';
    });
    result += '  </items>\n';
    result += '</report>';
  } else {
    result = title + '\n';
    result += '='.repeat(50) + '\n';
    data.slice(0, maxItems).forEach((item, idx) => {
      result += `${idx + 1}. `;
      Object.entries(item).forEach(([key, value]) => {
        result += `${key}: ${value}, `;
      });
      result += '\n';
    });
  }
  
  if (options?.includeHeader) {
    result = 'HEADER\n' + '='.repeat(headerSize * 10) + '\n' + result;
  }
  
  if (options?.includeFooter) {
    result = result + '\n' + '='.repeat(footerSize * 10) + '\nFOOTER';
  }
  
  return result;
}

const unusedVar = 'this variable is never used';
const anotherUnused = 42;

function unusedFunction(x, y) {
  return x + y;
}

module.exports = {
  processUserData,
  calculatePrice,
  generateReport
};
