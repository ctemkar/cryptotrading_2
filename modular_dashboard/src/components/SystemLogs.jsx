import React, { useRef } from 'react';

function SystemLogs() {
  const logsRef = useRef();

  const clearLogs = () => {
    if (logsRef.current) logsRef.current.innerHTML = '';
  };

  return (
    <div className="system-logs">
      <h3>System Logs</h3>
      <button onClick={clearLogs}>Clear Logs</button>
      <div ref={logsRef} className="log-box" style={{background: 'black', color: 'lime', padding: '10px', height: '150px', overflowY: 'auto'}}>
        <p>[INFO] Connected to exchange</p>
        <p>[WARN] High latency detected</p>
      </div>
    </div>
  );
}

export default SystemLogs;