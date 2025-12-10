import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const DEFAULT_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf'
];

function formatTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatYAxis(value) {
  if (value == null || Number.isNaN(value)) return '';
  return `$${Math.round(value).toLocaleString()}`;
}

const CustomTooltip = ({ active, payload, label, modelsMetaMap }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #ccc',
        padding: '8px 10px',
        borderRadius: '4px',
        fontSize: '12px'
      }}
    >
      <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>{formatTime(label)}</div>
      {payload.map((entry) => {
        const id = entry.dataKey;
        const meta = modelsMetaMap[id] || {};
        const name = meta.name || id;
        const color = meta.color || entry.color;
        const v = Math.round(entry.value);

        return (
          <div key={id} style={{ color, marginBottom: '2px' }}>
            <span style={{ fontWeight: 'bold' }}>{name}: </span>
            <span>${v.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
};

function ModelsComparisonChart({
  modelsHistory = {},
  selectedModels = [],
  startingValue = 10000,   // from Dashboard
  initialValues            // not used here, but kept for future if needed
}) {
  // --- 1) Collect model ids + metadata --------------------------
  const { modelIds, modelsMeta, modelsMetaMap } = useMemo(() => {
    const ids = Object.keys(modelsHistory || {});
    const metaArr = ids.map((id, idx) => {
      const arr = modelsHistory[id] || [];
      const first = arr[0] || {};
      return {
        id,
        name: first.name || id,
        color: first.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
      };
    });
    const metaMap = metaArr.reduce((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {});
    return { modelIds: ids, modelsMeta: metaArr, modelsMetaMap: metaMap };
  }, [modelsHistory]);

  // --- 2) Capture each model's FIRST value (its real initial value) ----
  const initialModelValues = useMemo(() => {
    const initVals = {};
    modelIds.forEach(id => {
      const history = modelsHistory[id] || [];
      if (history.length > 0) {
        initVals[id] = history[0].accountValue;
      }
    });
    return initVals;
  }, [modelsHistory, modelIds]);

  // --- 3) Build NORMALIZED chart data --------------------------
  // All models start at `startingValue` and then move by % change.
  const chartData = useMemo(() => {
    if (!modelIds.length) return [];

    // Use the first model's history as base for timestamps
    const baseHistory = modelsHistory[modelIds[0]] || [];
    
    return baseHistory.map((basePoint, index) => {
      const row = {
        time: basePoint.timestamp
      };

      modelIds.forEach((id) => {
        const series = modelsHistory[id] || [];
        const point = series[index];

        if (point && typeof point.accountValue === 'number') {
          const initialValue = initialModelValues[id];

          if (initialValue && initialValue > 0) {
            // % change from that model's original value
            const percentChange = (point.accountValue - initialValue) / initialValue;
            // Apply % change to the USER'S startingValue
            const normalizedValue = startingValue * (1 + percentChange);
            row[id] = Math.round(normalizedValue);
          } else {
            // Fallback: no initial, just use raw value
            row[id] = Math.round(point.accountValue);
          }
        }
      });

      return row;
    });
  }, [modelsHistory, modelIds, initialModelValues, startingValue]);

  if (!modelIds.length || !chartData.length) {
    return (
      <div
        style={{
          background: '#fff3e0',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #ffb74d',
          marginTop: '20px'
        }}
      >
        <strong>
          Models Comparison (All Starting at ${startingValue.toLocaleString()})
        </strong>
        <div style={{ marginTop: '8px', fontSize: '14px' }}>
          ⚠️ No history data yet. Waiting for updates from the backend...
        </div>
      </div>
    );
  }

  const allSelected = !selectedModels || selectedModels.length === 0;

  // --- 4) Render chart -----------------------------------------
  return (
    <div
      style={{
        width: '100%',
        height: 400,
        marginTop: '20px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '12px 16px'
      }}
    >
      <h3 style={{ margin: '0 0 8px 0' }}>
        Models Comparison (All Starting at ${startingValue.toLocaleString()})
      </h3>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
        All models are normalized to start at ${startingValue.toLocaleString()}.
        {' '}Solid lines = selected models. Dotted lines = unselected models.
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 15, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            minTickGap={20}
          />
          <YAxis
            tickFormatter={formatYAxis}
            width={80}
          />
          <Tooltip content={<CustomTooltip modelsMetaMap={modelsMetaMap} />} />
          <Legend />

          {modelsMeta.map((model) => {
            const isSelected =
              allSelected || (selectedModels && selectedModels.includes(model.id));

            return (
              <Line
                key={model.id}
                type="monotone"
                dataKey={model.id}
                name={model.name}
                stroke={model.color}
                dot={false}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray={isSelected ? '0' : '5 5'}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ModelsComparisonChart;