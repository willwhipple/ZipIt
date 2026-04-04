import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import supabase from '../../lib/supabase';
import { generatePackingList } from '../../lib/generation';
import type { Activity, AccommodationType } from '../../types';

const ACCOMMODATION_TYPES: AccommodationType[] = [
  'Hotel',
  'Airbnb',
  'Camping',
  'Staying with someone',
  'Other',
];

// Validates a YYYY-MM-DD date string
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

export default function CreateTripScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [accommodationType, setAccommodationType] = useState<AccommodationType>('Hotel');
  const [carryOnOnly, setCarryOnOnly] = useState(false);
  const [laundryAvailable, setLaundryAvailable] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase.from('activities').select('*').order('name');
    if (error) Alert.alert('Error', error.message);
    else setActivities(data ?? []);
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  function toggleActivity(id: string) {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    // Validate
    if (!name.trim()) {
      Alert.alert('Required', 'Trip name is required.');
      return;
    }
    if (!isValidDate(startDate)) {
      Alert.alert('Invalid Date', 'Start date must be YYYY-MM-DD.');
      return;
    }
    if (!isValidDate(endDate)) {
      Alert.alert('Invalid Date', 'End date must be YYYY-MM-DD.');
      return;
    }
    if (endDate < startDate) {
      Alert.alert('Invalid Dates', 'End date must be on or after start date.');
      return;
    }

    setSaving(true);

    // Insert trip
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        accommodation_type: accommodationType,
        carry_on_only: carryOnOnly,
        laundry_available: laundryAvailable,
      })
      .select()
      .single();

    if (tripError) {
      Alert.alert('Error', tripError.message);
      setSaving(false);
      return;
    }

    // Insert trip activities
    if (selectedActivityIds.length > 0) {
      const { error: taError } = await supabase
        .from('trip_activities')
        .insert(selectedActivityIds.map((activity_id) => ({ trip_id: trip.id, activity_id })));

      if (taError) {
        Alert.alert('Error', taError.message);
        setSaving(false);
        return;
      }
    }

    // Run packing list generation
    try {
      await generatePackingList(trip.id);
    } catch (err: any) {
      Alert.alert('Error generating packing list', err.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    // Replace current screen so back goes to Home, not Create Trip
    router.replace(`/trip/${trip.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <TouchableOpacity onPress={() => router.back()}>
              <Text className="text-base text-blue-500">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold text-gray-900">New Trip</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Trip Name */}
          <View className="px-5 mt-4">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">
              TRIP NAME
            </Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900"
              placeholder="e.g. Scottsdale Golf Trip"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          {/* Dates */}
          <View className="px-5 mt-6 flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">
                START DATE
              </Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
                value={startDate}
                onChangeText={setStartDate}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">
                END DATE
              </Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
                value={endDate}
                onChangeText={setEndDate}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* Accommodation */}
          <View className="px-5 mt-6">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">
              ACCOMMODATION
            </Text>
            <View className="border border-gray-200 rounded-lg overflow-hidden">
              {ACCOMMODATION_TYPES.map((type, i) => (
                <TouchableOpacity
                  key={type}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i < ACCOMMODATION_TYPES.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                  onPress={() => setAccommodationType(type)}
                  activeOpacity={0.6}
                >
                  <Text className="text-base text-gray-900">{type}</Text>
                  {accommodationType === type && (
                    <Text className="text-blue-500 font-medium">✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Activities */}
          <View className="px-5 mt-6">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">
              ACTIVITIES
            </Text>
            {activities.length === 0 ? (
              <Text className="text-sm text-gray-400">
                No activities yet — add some in the Activities Manager.
              </Text>
            ) : (
              <View className="border border-gray-200 rounded-lg overflow-hidden">
                {activities.map((act, i) => (
                  <TouchableOpacity
                    key={act.id}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      i < activities.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                    onPress={() => toggleActivity(act.id)}
                    activeOpacity={0.6}
                  >
                    <Text className="text-base text-gray-900">{act.name}</Text>
                    {selectedActivityIds.includes(act.id) && (
                      <Text className="text-blue-500 font-medium">✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Toggles */}
          <View className="px-5 mt-6">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">OPTIONS</Text>
            <View className="border border-gray-200 rounded-lg overflow-hidden">
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
                <View>
                  <Text className="text-base text-gray-900">Carry-on only</Text>
                  <Text className="text-xs text-gray-400 mt-0.5">No checked baggage</Text>
                </View>
                <Switch
                  value={carryOnOnly}
                  onValueChange={setCarryOnOnly}
                  trackColor={{ true: '#3b82f6' }}
                />
              </View>
              <View className="flex-row items-center justify-between px-4 py-3">
                <View>
                  <Text className="text-base text-gray-900">Laundry available</Text>
                  <Text className="text-xs text-gray-400 mt-0.5">Can re-wear clothes</Text>
                </View>
                <Switch
                  value={laundryAvailable}
                  onValueChange={setLaundryAvailable}
                  trackColor={{ true: '#3b82f6' }}
                />
              </View>
            </View>
          </View>

          {/* CTA */}
          <View className="px-5 mt-8">
            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${saving ? 'bg-blue-300' : 'bg-blue-500'}`}
              onPress={handleGenerate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-semibold">Generate Packing List</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
