import { useState, useEffect } from 'react';
import socket from '../services/socket';

function useModels() {
  const [modelsLatest, setModelsLatest] = useState({});
  const [modelsHistory, setModelsHistory] = useState({});

  useEffect(() => {
    console.log('🔌 useModels: Setting up socket listeners');

    // Handle initial snapshot on connection
    const handleSnapshot = (snapshot) => {
      console.log('📸 models_snapshot received:', snapshot);
      
      if (!Array.isArray(snapshot)) return;

      const latest = {};
      const history = {};

      snapshot.forEach(model => {
        if (model && model.id) {
          // Store latest value
          latest[model.id] = {
            id: model.id,
            name: model.name,
            color: model.color,
            accountValue: model.accountValue
          };

          // Store history if provided
          if (Array.isArray(model.history)) {
            history[model.id] = model.history.map(point => ({
              timestamp: point.time,
              accountValue: point.accountValue,
              id: model.id,
              name: model.name,
              color: model.color
            }));
          }
        }
      });

      setModelsLatest(latest);
      setModelsHistory(history);
      console.log('📊 Initial state loaded:', { latest, history });
    };

    // Handle ongoing updates
    const handleUpdate = (updates) => {
      console.log('📥 models_update received:', updates);
      
      if (!Array.isArray(updates)) return;

      // Update latest values
      setModelsLatest(prev => {
        const updated = { ...prev };
        updates.forEach(model => {
          if (model && model.id) {
            updated[model.id] = {
              id: model.id,
              name: model.name,
              color: model.color,
              accountValue: model.accountValue
            };
          }
        });
        console.log('📊 modelsLatest updated:', updated);
        return updated;
      });

      // Update history
      setModelsHistory(prev => {
        const updated = { ...prev };
        updates.forEach(model => {
          if (model && model.id && typeof model.accountValue === 'number') {
            // Initialize array if needed
            if (!updated[model.id]) {
              updated[model.id] = [];
            }
            
            // Add new history point
            updated[model.id].push({
              timestamp: model.time || Date.now(),
              accountValue: model.accountValue,
              id: model.id,
              name: model.name,
              color: model.color
            });
            
            // Keep only last 100 points
            if (updated[model.id].length > 100) {
              updated[model.id] = updated[model.id].slice(-100);
            }
          }
        });
        console.log('📈 modelsHistory updated:', updated);
        return updated;
      });
    };

    // Listen to the correct event names from your backend
    socket.on('models_snapshot', handleSnapshot);
    socket.on('models_update', handleUpdate);

    return () => {
      console.log('🔌 useModels: Cleaning up socket listeners');
      socket.off('models_snapshot', handleSnapshot);
      socket.off('models_update', handleUpdate);
    };
  }, []);

  return { modelsLatest, modelsHistory };
}

export default useModels;