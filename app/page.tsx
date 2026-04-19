'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import AppLogo from '@/components/AppLogo';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { TripCard } from '@/components/ui/TripCard';
import { PrimaryBtn } from '@/components/ui/Button';

type TripWithProgress = Trip & {
  packing_list_entries: { id: string; packed: boolean }[];
};

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [trips, setTrips] = useState<TripWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  async function fetchTrips() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('trips')
      .select('*, packing_list_entries(id, packed)')
      .eq('archived', false)
      .gte('end_date', today)
      .order('start_date', { ascending: true });

    if (!error && data) setTrips(data as TripWithProgress[]);
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (loading) {
    return <LuggageSpinner />;
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <PageHeader
        leading={
          <h1><AppLogo size="md" colorScheme="white" /></h1>
        }
        trailing={
          <HeaderIconBtn onClick={() => router.push('/settings')} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </HeaderIconBtn>
        }
      />

      {/* Content */}
      {trips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <SuitcaseIcon size={48} className="text-sky-500" />
          <h2 className="text-xl font-semibold" style={{ color: 'var(--zi-text)' }}>No trips yet</h2>
          <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
            Create your first trip to generate a packing list, or head to My stuff to add items.
          </p>
          <PrimaryBtn onClick={() => router.push('/trip/create')} className="mt-2">
            New trip
          </PrimaryBtn>
          <button
            onClick={() => router.push('/trips/history')}
            className="text-sm"
            style={{ color: 'var(--zi-text-subtle)' }}
          >
            Past trips →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-4">
          {trips.map((trip) => {
            const total = trip.packing_list_entries.length;
            const packed = trip.packing_list_entries.filter((e) => e.packed).length;

            return (
              <TripCard
                key={trip.id}
                name={trip.name}
                dates={`${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}`}
                destination={trip.destination ?? undefined}
                packed={packed}
                total={total}
                onClick={() => router.push(`/trip/${trip.id}`)}
              />
            );
          })}

          <div className="flex items-center justify-between pt-2 pb-1">
            <button
              onClick={() => router.push('/trips/history')}
              className="text-sm"
              style={{ color: 'var(--zi-text-subtle)' }}
            >
              Past trips →
            </button>
            <PrimaryBtn onClick={() => router.push('/trip/create')}>
              + New trip
            </PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}
