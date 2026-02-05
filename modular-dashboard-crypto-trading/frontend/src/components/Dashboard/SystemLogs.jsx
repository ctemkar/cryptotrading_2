// components/Dashboard/SystemLogs.jsx
import React from 'react';

const SystemLogs = ({ tradingLogs }) => {
  return (
    <div style={{
      height: '150px',
      overflowY: 'auto',
      backgroundColor: '#1e1e1e',
      color: '#00ff00',
      padding: '10px',
      fontFamily: 'monospace',
      fontSize: '12px',
      borderRadius: '8px',
      marginTop: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ borderBottom: '1px solid #333', marginBottom: '5px', fontWeight: 'bold', paddingBottom: '5px' }}>
        SYSTEM LOGS
      </div>
      {tradingLogs.map((log, i) => (
        <div key={i} style={{ 
          marginBottom: '2px', 
          color: log.type === 'error' ? '#ff4444' : log.type === 'success' ? '#00ff00' : log.type === 'warning' ? '#ffaa00' : '#aaa' 
        }}>
          [{log.timestamp}] {log.message}
        </div>
      ))}
    </div>
  );
};

export default SystemLogs;