import React from 'react';

function OrderBook() {
  return (
    <div className="order-book">
      <h3>Order Book</h3>
      <table>
        <thead>
          <tr><th>Price</th><th>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>$45,100</td><td>0.5</td></tr>
          <tr><td>$45,050</td><td>1.2</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export default OrderBook;