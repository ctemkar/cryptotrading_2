import React from 'react';
import Header from './components/Header';
import PriceTickers from './components/PriceTickers';
import TradePanel from './components/TradePanel';
import OrderBook from './components/OrderBook';
import SystemLogs from './components/SystemLogs';
import ChartArea from './components/ChartArea';
import './styles/Dashboard.css';

function App() {
  return (
    <div className="dashboard">
      <Header />
      <PriceTickers />
      <div className="main-content">
        <TradePanel />
        <ChartArea />
        <OrderBook />
      </div>
      <SystemLogs />
    </div>
  );
}

export default App;