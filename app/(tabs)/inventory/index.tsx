import { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import supabase from '../../../lib/supabase';
import type { CategoryType, Item } from '../../../types';

const CATEGORY_ORDER: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];

type ItemWithActivities = Item & {
  item_activities: { activity_id: string }[];
};

type Section = {
  title: CategoryType;
  data: ItemWithActivities[];
};

export default function InventoryScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*, item_activities(activity_id)')
      .order('name');

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    const items = (data ?? []) as ItemWithActivities[];

    // Group into sections by category, preserving the canonical order
    const built: Section[] = CATEGORY_ORDER
      .map((cat) => ({ title: cat, data: items.filter((i) => i.category === cat) }))
      .filter((s) => s.data.length > 0);

    setSections(built);
    setLoading(false);
  }, []);

  // Re-fetch whenever this screen comes into focus (after add/edit navigates back)
  useFocusEffect(fetchItems);

  function handleRowPress(item: ItemWithActivities) {
    Alert.alert(item.name, undefined, [
      {
        text: 'Edit',
        onPress: () => router.push(`/inventory/item/${item.id}`),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(item),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete(item: ItemWithActivities) {
    Alert.alert(
      'Delete Item',
      `Delete "${item.name}"? This will also remove it from any packing lists.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('items').delete().eq('id', item.id);
            if (error) Alert.alert('Error', error.message);
            else fetchItems();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Text className="text-2xl font-bold text-gray-900">Inventory</Text>
            <TouchableOpacity onPress={() => router.push('/inventory/item/create')}>
              <Text className="text-base font-medium text-blue-500">Add Item</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center mt-16 px-8">
              <Text className="text-base text-gray-400 text-center">
                No items yet. Tap "Add Item" to build your inventory.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <TouchableOpacity
            className="flex-row items-center px-5 py-4 mt-6 border-t border-gray-100"
            onPress={() => router.push('/activities')}
          >
            <Text className="flex-1 text-base text-gray-500">Manage Activities</Text>
            <Text className="text-gray-300 text-lg">›</Text>
          </TouchableOpacity>
        }
        renderSectionHeader={({ section }) => (
          <View className="px-5 pt-5 pb-1">
            <Text className="text-xs font-semibold text-gray-400 tracking-wide">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TouchableOpacity
            className={`flex-row items-center px-5 py-4 ${
              index < section.data.length - 1 ? 'border-b border-gray-100' : ''
            }`}
            onPress={() => handleRowPress(item)}
            activeOpacity={0.6}
          >
            <View className="flex-1">
              <Text className="text-base text-gray-900">{item.name}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {item.quantity_type === 'fixed'
                  ? 'Fixed qty'
                  : item.quantity_type === 'per_night'
                  ? 'Per night'
                  : 'Per activity'}
                {item.item_activities.length > 0
                  ? ` · ${item.item_activities.length} ${item.item_activities.length === 1 ? 'activity' : 'activities'}`
                  : ''}
              </Text>
            </View>
            <Text className="text-gray-300 text-lg">›</Text>
          </TouchableOpacity>
        )}
      />
      {loading && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
