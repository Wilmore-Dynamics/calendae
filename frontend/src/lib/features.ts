import { useState, useEffect } from 'react';

export interface Features {
  buffer_times: boolean;
  min_notice: boolean;
  max_bookings: boolean;
  round_robin: boolean;
  collective: boolean;
  webhooks: boolean;
  payments: boolean;
  timezone_detection: boolean;
  video_conferencing: boolean;
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
  video_conferencing: true,
};

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(defaults);

  useEffect(() => {
    fetch('/api/config/features')
      .then((r) => r.json())
      .then(setFeatures)
      .catch(() => {});
  }, []);

  return features;
}
