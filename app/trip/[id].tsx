import { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import supabase from '../../lib/supabase';
import type { Trip, Item, PackingListEntry, CategoryType } from '../../types';

const CATEGORY_ORDER: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];

// Supabase returns the joined table as `items`, not `item`
type EntryWithItem = PackingListEntry & { items: Item };

type Section = {
  title: CategoryType;
  data: EntryWithItem[];
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function PackingListScreen() {
  const router = useRouter();
  const { id: tripId } = useLocalSearchParams<{ id: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [adHocModalVisible, setAdHocModalVisible] = useState(false);
  const [adHocName, setAdHocName] = useState('');
  const [addingAdHoc, setAddingAdHoc] = useState(false);

  const fetchData = useCallback(async () => {
    const [tripResult, entriesResult] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase
        .from('packing_list_entries')
        .select('*, items(*)')
        .eq('trip_id', tripId)
        .order('items(name)'),
    ]);

    if (tripResult.error) {
      Alert.alert('Error', tripResult.error.message);
      setLoading(false);
      return;
    }
    if (entriesResult.error) {
      Alert.alert('Error', entriesResult.error.message);
      setLoading(false);
      return;
    }

    setTrip(tripResult.data);

    const entries = (entriesResult.data ?? []) as EntryWithItem[];

    // Group entries by their item's category
    const built: Section[] = CATEGORY_ORDER
      .map((cat) => ({ title: cat, data: entries.filter((e) => e.items?.category === cat) }))
      .filter((s) => s.data.length > 0);

    // Ad-hoc items with no category fall into a misc bucket at the end
    const miscEntries = entries.filter(
      (e) => !e.items?.category || !CATEGORY_ORDER.includes(e.items.category)
    );
    if (miscEntries.length > 0) {
      built.push({ title: 'Accessories' as CategoryType, data: miscEntries });
    }

    setSections(built);
    setLoading(false);
  }, [tripId]);

  useFocusEffect(fetchData);

  async function togglePacked(entry: EntryWithItem) {
    const newPacked = !entry.packed;

    // Optimistic update
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        data: s.data.map((e) => (e.id === entry.id ? { ...e, packed: newPacked } : e)),
      }))
    );

    const { error } = await supabase
      .from('packing_list_entries')
      .update({ packed: newPacked })
      .eq('id', entry.id);

    if (error) {
      Alert.alert('Error', error.message);
      // Revert on failure
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          data: s.data.map((e) => (e.id === entry.id ? { ...e, packed: entry.packed } : e)),
        }))
      );
      return;
    }

    // Check if all items are now packed
    const allEntries = sections.flatMap((s) => s.data).map((e) =>
      e.id === entry.id ? { ...e, packed: newPacked } : e
    );
    const allPacked = allEntries.length > 0 && allEntries.every((e) => e.packed);
    if (allPacked) {
      Alert.alert(
        'All packed! 🎒',
        'Ready to go? You can archive this trip.',
        [
          { text: 'Not Yet', style: 'cancel' },
          { text: 'Archive', onPress: () => archiveTrip() },
        ]
      );
    }
  }

  async function archiveTrip() {
    const { error } = await supabase
      .from('trips')
      .update({ archived: true })
      .eq('id', tripId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.replace('/');
  }

  async function handleAddAdHoc() {
    const trimmed = adHocName.trim();
    if (!trimmed) return;
    setAddingAdHoc(true);

    // Create a minimal item entry for the ad-hoc item
    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({ name: trimmed, category: 'Accessories', quantity_type: 'fixed' })
      .select()
      .single();

    if (itemError) {
      Alert.alert('Error', itemError.message);
      setAddingAdHoc(false);
      return;
    }

    const { data: newEntry, error: entryError } = await supabase
      .from('packing_list_entries')
      .insert({
        trip_id: tripId,
        item_id: newItem.id,
        quantity: 1,
        packed: false,
        is_adhoc: true,
        added_to_inventory: null,
      })
      .select()
      .single();

    if (entryError) {
      Alert.alert('Error', entryError.message);
      setAddingAdHoc(false);
      return;
    }

    setAddingAdHoc(false);
    setAdHocName('');
    setAdHocModalVisible(false);
    fetchData();

    // Prompt about adding to inventory
    Alert.alert(
      'Add to inventory?',
      `Add "${trimmed}" to your master inventory so it shows up on future trips?`,
      [
        {
          text: 'Yes',
          onPress: () => {
            supabase
              .from('packing_list_entries')
              .update({ added_to_inventory: true })
              .eq('id', newEntry.id);
            router.push(`/inventory/item/${newItem.id}`);
          },
        },
        {
          text: 'Later',
          onPress: () => {
            // added_to_inventory remains null — surfaced in Stage 2 review queue
          },
        },
        {
          text: 'No',
          style: 'destructive',
          onPress: () => {
            supabase
              .from('packing_list_entries')
              .update({ added_to_inventory: false })
              .eq('id', newEntry.id);
          },
        },
      ]
    );
  }

  const allEntries = sections.flatMap((s) => s.data);
  const packedCount = allEntries.filter((e) => e.packed).length;
  const totalCount = allEntries.length;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View className="px-5 pt-4 pb-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-base text-blue-500">‹ Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Trip Options', undefined, [
                { text: 'Archive Trip', style: 'destructive', onPress: archiveTrip },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
          >
            <Text className="text-base text-gray-400">•••</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 mt-2" numberOfLines={1}>
          {trip?.name}
        </Text>
        {trip && (
          <Text className="text-sm text-gray-400 mt-0.5">
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </Text>
        )}
        <Text className="text-sm font-medium text-blue-500 mt-1">
          {packedCount} of {totalCount} packed
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View className="items-center mt-16 px-8">
            <Text className="text-base text-gray-400 text-center">
              No items in this packing list.{'\n'}Tap + to add something.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View className="px-5 pt-5 pb-1">
            <Text className="text-xs font-semibold text-gray-400 tracking-wide">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        renderItem={({ item: entry, index, section }) => (
          <TouchableOpacity
            className={`flex-row items-center px-5 py-4 ${
              index < section.data.length - 1 ? 'border-b border-gray-100' : ''
            }`}
            onPress={() => togglePacked(entry)}
            activeOpacity={0.6}
          >
            {/* Checkbox */}
            <View
              className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                entry.packed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}
            >
              {entry.packed && <Text className="text-white text-xs font-bold">✓</Text>}
            </View>

            <View className="flex-1">
              <Text
                className={`text-base ${
                  entry.packed ? 'text-gray-300 line-through' : 'text-gray-900'
                }`}
              >
                {entry.items?.name ?? 'Unknown item'}
              </Text>
              {entry.quantity > 1 && (
                <Text className="text-xs text-gray-400 mt-0.5">Qty: {entry.quantity}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-10 right-6 bg-blue-500 w-14 h-14 rounded-full items-center justify-center shadow-lg"
        onPress={() => setAdHocModalVisible(true)}
      >
        <Text className="text-white text-3xl font-light leading-none">+</Text>
      </TouchableOpacity>

      {/* Ad-hoc item modal */}
      <Modal
        visible={adHocModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAdHocModalVisible(false)}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            className="flex-1 bg-black/40 items-center justify-center px-6"
            onPress={() => setAdHocModalVisible(false)}
          >
            <Pressable className="w-full bg-white rounded-2xl p-6 shadow-lg">
              <Text className="text-lg font-semibold text-gray-900 mb-4">Add Item</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-3 py-2 text-base mb-6 text-gray-900"
                placeholder="Item name"
                placeholderTextColor="#9ca3af"
                value={adHocName}
                onChangeText={setAdHocName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleAddAdHoc}
              />
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 border border-gray-200 rounded-lg py-3 items-center"
                  onPress={() => {
                    setAdHocModalVisible(false);
                    setAdHocName('');
                  }}
                >
                  <Text className="text-base text-gray-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 rounded-lg py-3 items-center ${
                    adHocName.trim() && !addingAdHoc ? 'bg-blue-500' : 'bg-blue-200'
                  }`}
                  onPress={handleAddAdHoc}
                  disabled={!adHocName.trim() || addingAdHoc}
                >
                  {addingAdHoc ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-base font-medium text-white">Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
