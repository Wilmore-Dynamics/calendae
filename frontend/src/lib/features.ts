import { useState, useEffect } from 'react';
import { API_BASE } from './api';

export interface Features {
  buffer_times: boolean;
  min_notice: boolean;
  max_bookings: boolean;
  round_robin: boolean;
  collective: boolean;
  webhooks: boolean;
  payments: boolean;
  timezone_detection: boolean;
}

const defaults: Features = {
  buffer_times: false,
  min_notice: false,
  max_bookings: false,
  round_robin: false,
  collective: false,
  webhooks: false,
  payments: false,
  timezone_detection: true,
};

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(defaults);

  useEffect(() => {
    fetch(`${API_BASE}/api/config/features`)
      .then((r) => r.json())
      .then(setFeatures)
      .catch(() => {});
  }, []);

  return features;
}
