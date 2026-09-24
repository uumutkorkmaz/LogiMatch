'use client';

import { Alert, Button } from '@logimatch/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapView } from '@/components/map-view';
import { errorText, post } from '@/lib/api-client';

/** Geocoding başarısız olduğunda haritadan yükleme noktası seçimi (#20). */
export function PinPicker({ loadId }: { loadId: string }) {
  const router = useRouter();
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <MapView
        markers={point ? [{ ...point, label: 'Yükleme' }] : []}
        onPick={setPoint}
        height={300}
      />
      {point ? (
        <p className="text-sm text-muted-foreground">
          {point.lat}, {point.lng}
        </p>
      ) : null}
      <div>
        <Button
          disabled={!point}
          onClick={async () => {
            try {
              await post(`/loads/${loadId}/pin`, { target: 'pickup', ...point });
              router.refresh();
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          Konumu kaydet
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
