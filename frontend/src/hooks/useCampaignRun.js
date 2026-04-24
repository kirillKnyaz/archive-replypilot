import { useRef, useState } from 'react';
import API from '../api';

export function useCampaignRun(campaignId, onRunComplete) {
  const [running, setRunning] = useState(false);
  const [runEvents, setRunEvents] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const eventSourceRef = useRef(null);

  function connectToSSE() {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setRunning(true);

    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const url = `${baseUrl}/campaigns/${campaignId}/run/live?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;
    const allEvents = [];

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        allEvents.push(event);
        setRunEvents([...allEvents]);

        if (event.type === 'lead_qualified') {
          setRunStats({
            enriched: event.index,
            total: event.total,
            qualified: event.qualified,
            archived: event.archived,
            errors: event.errors,
          });
        }
        if (event.type === 'complete') {
          setRunStats(event);
          es.close();
          setRunning(false);
          onRunComplete?.();
        }
        if (event.type === 'error') {
          es.close();
          setRunning(false);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  }

  async function checkForActiveRun() {
    try {
      const { data } = await API.get(`/campaigns/${campaignId}/run/status`);
      if (data.active) connectToSSE();
    } catch {}
  }

  async function startLiveRun() {
    setRunEvents([]);
    setRunStats(null);
    try {
      const { data } = await API.post(`/campaigns/${campaignId}/run`);
      if (data.alreadyRunning) {
        connectToSSE();
        return;
      }
      setTimeout(() => connectToSSE(), 100);
    } catch (e) {
      console.error('Failed to start run', e);
    }
  }

  async function startLiveRequalify() {
    setRunEvents([]);
    setRunStats(null);
    try {
      const { data } = await API.post(`/campaigns/${campaignId}/requalify`);
      if (data.alreadyRunning) {
        connectToSSE();
        return;
      }
      setTimeout(() => connectToSSE(), 100);
    } catch (e) {
      console.error('Failed to start requalify', e);
    }
  }

  function dismiss() {
    setRunEvents([]);
    setRunStats(null);
  }

  function cleanup() {
    if (eventSourceRef.current) eventSourceRef.current.close();
  }

  return { running, runEvents, runStats, startLiveRun, startLiveRequalify, checkForActiveRun, dismiss, cleanup };
}
