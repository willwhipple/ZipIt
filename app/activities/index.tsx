import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import supabase from '../../lib/supabase';
import type { Activity } from '../../types';

export default function ActivitiesScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  // null = adding new; Activity = editing existing
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [inputName, setInputName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('name');

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setActivities(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  function openAddModal() {
    setEditingActivity(null);
    setInputName('');
    setModalVisible(true);
  }

  function openEditModal(activity: Activity) {
    setEditingActivity(activity);
    setInputName(activity.name);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingActivity(null);
    setInputName('');
  }

  async function handleSave() {
    const trimmed = inputName.trim();
    if (!trimmed) return;

    setSaving(true);

    if (editingActivity) {
      // Update existing activity
      const { error } = await supabase
        .from('activities')
        .update({ name: trimmed })
        .eq('id', editingActivity.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        closeModal();
        fetchActivities();
      }
    } else {
      // Insert new activity
      const { error } = await supabase
        .from('activities')
        .insert({ name: trimmed });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        closeModal();
        fetchActivities();
      }
    }

    setSaving(false);
  }

  async function handleDelete(activity: Activity) {
    // Check if any items are assigned to this activity before deleting
    const { data, error } = await supabase
      .from('item_activities')
      .select('item_id')
      .eq('activity_id', activity.id)
      .limit(1);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    if (data && data.length > 0) {
      Alert.alert(
        'Cannot Delete',
        `"${activity.name}" is assigned to one or more items. Remove it from all items before deleting.`
      );
      return;
    }

    Alert.alert(
      'Delete Activity',
      `Are you sure you want to delete "${activity.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error: deleteError } = await supabase
              .from('activities')
              .delete()
              .eq('id', activity.id);

            if (deleteError) {
              Alert.alert('Error', deleteError.message);
            } else {
              fetchActivities();
            }
          },
        },
      ]
    );
  }

  function handleRowPress(activity: Activity) {
    Alert.alert(activity.name, undefined, [
      {
        text: 'Edit Name',
        onPress: () => openEditModal(activity),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => handleDelete(activity),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Text className="text-2xl font-bold text-gray-900">Activities</Text>
            <TouchableOpacity onPress={openAddModal}>
              <Text className="text-base font-medium text-blue-500">Add</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center mt-16">
              <Text className="text-base text-gray-400">No activities yet.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row items-center px-5 py-4 border-b border-gray-100"
            onPress={() => handleRowPress(item)}
            activeOpacity={0.6}
          >
            <Text className="flex-1 text-base text-gray-900">{item.name}</Text>
            <Text className="text-gray-300 text-lg">›</Text>
          </TouchableOpacity>
        )}
      />

      {loading && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            className="flex-1 bg-black/40 items-center justify-center px-6"
            onPress={closeModal}
          >
            {/* Stop propagation so tapping the card doesn't close the modal */}
            <Pressable className="w-full bg-white rounded-2xl p-6 shadow-lg">
              <Text className="text-lg font-semibold text-gray-900 mb-4">
                {editingActivity ? 'Edit Activity' : 'New Activity'}
              </Text>

              <TextInput
                className="border border-gray-300 rounded-lg px-3 py-2 text-base mb-6 text-gray-900"
                placeholder="Activity name"
                placeholderTextColor="#9ca3af"
                value={inputName}
                onChangeText={setInputName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />

              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 border border-gray-200 rounded-lg py-3 items-center"
                  onPress={closeModal}
                >
                  <Text className="text-base text-gray-600">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={`flex-1 rounded-lg py-3 items-center ${
                    inputName.trim() && !saving ? 'bg-blue-500' : 'bg-blue-200'
                  }`}
                  onPress={handleSave}
                  disabled={!inputName.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-base font-medium text-white">Save</Text>
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
