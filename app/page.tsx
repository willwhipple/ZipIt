'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip } from '@/types';

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings')}
            aria-label="Settings"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Zip It</h1>
        </div>
        <button
          onClick={() => router.push('/trip/create')}
          className="bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-full"
        >
          + New Trip
        </button>
      </div>

      {/* Content */}
      {trips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="text-5xl">🧳</div>
          <h2 className="text-xl font-semibold text-gray-800">No trips yet</h2>
          <p className="text-gray-500 text-sm">
            Create your first trip to generate a packing list, or head to Inventory to add items.
          </p>
          <button
            onClick={() => router.push('/trip/create')}
            className="mt-2 bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl"
          >
            Create Your First Trip
          </button>
          <button
            onClick={() => router.push('/trips/history')}
            className="text-sm text-gray-400"
          >
            Past trips →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {trips.map((trip) => {
            const total = trip.packing_list_entries.length;
            const packed = trip.packing_list_entries.filter((e) => e.packed).length;
            const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

            return (
              <button
                key={trip.id}
                onClick={() => router.push(`/trip/${trip.id}`)}
                className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{trip.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
                    </p>
                  </div>
                  <span className="text-blue-500 text-xl">›</span>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {packed} / {total} packed
                  </span>
                </div>
              </button>
            );
          })}

          {/* Past trips link */}
          <button
            onClick={() => router.push('/trips/history')}
            className="w-full text-center text-sm text-gray-400 py-3"
          >
            Past trips →
          </button>
        </div>
      )}
    </div>
  );
}
