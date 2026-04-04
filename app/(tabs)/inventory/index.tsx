import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

// Placeholder inventory screen — item list will be built in a future session
export default function InventoryScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900">Inventory</Text>
      </View>

      <View className="px-5 mt-4">
        <TouchableOpacity
          className="flex-row items-center py-4 border-b border-gray-100"
          onPress={() => router.push('/activities')}
        >
          <Text className="flex-1 text-base text-gray-900">Manage Activities</Text>
          <Text className="text-gray-300 text-lg">›</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
