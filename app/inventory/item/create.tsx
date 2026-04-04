import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import supabase from '../../../lib/supabase';
import type { Activity, CategoryType, QuantityType } from '../../../types';

const CATEGORIES: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];

const QUANTITY_TYPES: { value: QuantityType; label: string; hint: string }[] = [
  { value: 'fixed', label: 'Fixed', hint: 'Always 1 (e.g. passport, laptop)' },
  { value: 'per_night', label: 'Per Night', hint: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', hint: 'Scales with matching activities' },
];

export default function CreateItemScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType>('Clothing');
  const [quantityType, setQuantityType] = useState<QuantityType>('fixed');
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

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Item name is required.');
      return;
    }
    setSaving(true);

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({ name: name.trim(), category, quantity_type: quantityType })
      .select()
      .single();

    if (itemError) {
      Alert.alert('Error', itemError.message);
      setSaving(false);
      return;
    }

    if (selectedActivityIds.length > 0) {
      const { error: actError } = await supabase
        .from('item_activities')
        .insert(selectedActivityIds.map((activity_id) => ({ item_id: item.id, activity_id })));

      if (actError) {
        Alert.alert('Error', actError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.back();
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <TouchableOpacity onPress={() => router.back()}>
              <Text className="text-base text-blue-500">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold text-gray-900">New Item</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <Text
                  className={`text-base font-medium ${name.trim() ? 'text-blue-500' : 'text-gray-300'}`}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Name */}
          <View className="px-5 mt-4">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">NAME</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900"
              placeholder="e.g. Running shoes"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          {/* Category */}
          <View className="px-5 mt-6">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">CATEGORY</Text>
            <View className="border border-gray-200 rounded-lg overflow-hidden">
              {CATEGORIES.map((cat, i) => (
                <TouchableOpacity
                  key={cat}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i < CATEGORIES.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.6}
                >
                  <Text className="text-base text-gray-900">{cat}</Text>
                  {category === cat && (
                    <Text className="text-blue-500 font-medium">✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Quantity Type */}
          <View className="px-5 mt-6">
            <Text className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">QUANTITY</Text>
            <View className="border border-gray-200 rounded-lg overflow-hidden">
              {QUANTITY_TYPES.map((qt, i) => (
                <TouchableOpacity
                  key={qt.value}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i < QUANTITY_TYPES.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                  onPress={() => setQuantityType(qt.value)}
                  activeOpacity={0.6}
                >
                  <View>
                    <Text className="text-base text-gray-900">{qt.label}</Text>
                    <Text className="text-xs text-gray-400 mt-0.5">{qt.hint}</Text>
                  </View>
                  {quantityType === qt.value && (
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
