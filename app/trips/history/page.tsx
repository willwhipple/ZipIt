'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';

type TripWithProgress = Trip & {
  packing_list_entries: { id: string; packed: boolean }[];
};

export default function TripHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [trips, setTrips] = useState<TripWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArchivedTrips();
  }, []);

  async function fetchArchivedTrips() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Archived trips = manually archived OR past their end date.
    const { data, error } = await supabase
      .from('trips')
      .select('*, packing_list_entries(id, packed)')
      .or(`archived.eq.true,end_date.lt.${today}`)
      .order('end_date', { ascending: false });

    if (!error && data) setTrips(data as TripWithProgress[]);
    setLoading(false);
  }

  function formatDateRange(start: string, end: string) {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    const sameYear = sy === ey;
    const startStr = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    const endStr = endDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startStr} – ${endStr}`;
  }

  function nightCount(start: string, end: string) {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const nights = Math.round(
      (new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()) /
        86_400_000
    );
    return `${nights} night${nights === 1 ? '' : 's'}`;
  }

  if (loading) {
    return <LuggageSpinner />;
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="header-noise px-4 pt-12 pb-4 bg-gradient-to-b from-sky-50 to-white">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} aria-label="Back" className="text-sky-500 -ml-1">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
        <h1 className="text-2xl font-bold font-logo text-sky-500">Past Trips</h1>
      </div>

      {/* Content */}
      {trips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <p className="text-gray-500 text-sm">No past trips yet. Completed trips will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {trips.map((trip) => {
            const total = trip.packing_list_entries.length;
            const packed = trip.packing_list_entries.filter((e) => e.packed).length;
            const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

            return (
              <button
                key={trip.id}
                onClick={() => router.push(`/trip/${trip.id}`)}
                className="w-full text-left px-4 py-4 bg-white"
              >
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{trip.name}</h2>
                  <span className="text-gray-300 text-lg ml-2">›</span>
                </div>
                <p className="text-sm text-gray-500 mb-2">
                  {formatDateRange(trip.start_date, trip.end_date)}
                  <span className="mx-1.5 text-gray-300">·</span>
                  {nightCount(trip.start_date, trip.end_date)}
                </p>

                {/* Packed progress — intentionally muted for archived trips */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-gray-400 h-1.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {packed} / {total} packed
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
