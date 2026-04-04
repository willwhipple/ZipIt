import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import supabase from '../../lib/supabase';
import type { Trip } from '../../types';

type TripWithProgress = Trip & {
  packing_list_entries: { id: string; packed: boolean }[];
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('*, packing_list_entries(id, packed)')
      .eq('archived', false)
      .order('start_date', { ascending: true });

    if (error) {
      console.error(error.message);
    } else {
      setTrips((data ?? []) as TripWithProgress[]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(fetchTrips);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Text className="text-2xl font-bold text-gray-900">Zip It</Text>
            <TouchableOpacity onPress={() => router.push('/trip/create')}>
              <Text className="text-base font-medium text-blue-500">New Trip</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-8 mt-24">
            <Text className="text-xl font-semibold text-gray-700 mb-2 text-center">
              No active trips
            </Text>
            <Text className="text-base text-gray-400 text-center mb-8">
              Create a trip and your packing list will be generated automatically.
            </Text>
            <TouchableOpacity
              className="bg-blue-500 rounded-xl px-6 py-3 mb-4"
              onPress={() => router.push('/trip/create')}
            >
              <Text className="text-white text-base font-semibold">Create Your First Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/inventory/item/create')}>
              <Text className="text-blue-500 text-base">Set Up Inventory</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: trip }) => {
          const total = trip.packing_list_entries.length;
          const packed = trip.packing_list_entries.filter((e) => e.packed).length;
          const progress = total > 0 ? packed / total : 0;

          return (
            <TouchableOpacity
              className="mx-5 mb-4 border border-gray-200 rounded-2xl p-4"
              onPress={() => router.push(`/trip/${trip.id}`)}
              activeOpacity={0.7}
            >
              <Text className="text-lg font-semibold text-gray-900" numberOfLines={1}>
                {trip.name}
              </Text>
              <Text className="text-sm text-gray-400 mt-0.5">
                {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
              </Text>

              {/* Progress bar */}
              <View className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <View
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </View>
              <Text className="text-xs text-gray-400 mt-1.5">
                {packed} of {total} packed
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}
