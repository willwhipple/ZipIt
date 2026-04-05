'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import type { Trip } from '@/types';

type TripWithProgress = Trip & {
  packing_list_entries: { id: string; packed: boolean }[];
};

export default function HomePage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  async function fetchTrips() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trips')
      .select('*, packing_list_entries(id, packed)')
      .eq('archived', false)
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
        <h1 className="text-2xl font-bold">Zip It</h1>
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
        </div>
      )}
    </div>
  );
}
