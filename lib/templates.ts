import type { InventorySuggestion } from '@/types';

export const UNIVERSAL_ESSENTIALS: InventorySuggestion[] = [
  { name: 'Phone charger', category: 'Accessories', quantityType: 'fixed', reason: 'Universal essential', activities: [] },
  { name: 'Wallet', category: 'Accessories', quantityType: 'fixed', reason: 'Universal essential', activities: [] },
  { name: 'Passport / ID', category: 'Accessories', quantityType: 'fixed', reason: 'Universal essential', activities: [] },
];

export const ACTIVITY_TEMPLATES: Record<string, InventorySuggestion[]> = {
  Beach: [
    { name: 'Swimsuit', category: 'Clothing', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Sunscreen SPF 50+', category: 'Toiletries', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Beach towel', category: 'Accessories', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Sunglasses', category: 'Accessories', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Flip flops', category: 'Shoes', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Cover-up / sarong', category: 'Clothing', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'After-sun lotion', category: 'Toiletries', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
    { name: 'Waterproof phone case', category: 'Accessories', quantityType: 'fixed', reason: 'Beach essential', activities: ['Beach'] },
  ],
  Business: [
    { name: 'Dress shirt', category: 'Clothing', quantityType: 'per_night', reason: 'Business attire', activities: ['Business'] },
    { name: 'Suit jacket', category: 'Clothing', quantityType: 'fixed', reason: 'Business attire', activities: ['Business'] },
    { name: 'Dress trousers', category: 'Clothing', quantityType: 'fixed', reason: 'Business attire', activities: ['Business'] },
    { name: 'Dress shoes', category: 'Shoes', quantityType: 'fixed', reason: 'Business attire', activities: ['Business'] },
    { name: 'Laptop', category: 'Equipment', quantityType: 'fixed', reason: 'Business essential', activities: ['Business'] },
    { name: 'Laptop charger', category: 'Equipment', quantityType: 'fixed', reason: 'Business essential', activities: ['Business'] },
    { name: 'Business cards', category: 'Accessories', quantityType: 'fixed', reason: 'Business essential', activities: ['Business'] },
    { name: 'Notebook and pen', category: 'Accessories', quantityType: 'fixed', reason: 'Business essential', activities: ['Business'] },
    { name: 'Travel adapter', category: 'Equipment', quantityType: 'fixed', reason: 'Business essential', activities: ['Business'] },
  ],
  Golf: [
    { name: 'Golf shirt', category: 'Clothing', quantityType: 'per_activity', reason: 'Golf attire', activities: ['Golf'] },
    { name: 'Golf trousers / shorts', category: 'Clothing', quantityType: 'per_activity', reason: 'Golf attire', activities: ['Golf'] },
    { name: 'Golf shoes', category: 'Shoes', quantityType: 'fixed', reason: 'Golf essential', activities: ['Golf'] },
    { name: 'Golf glove', category: 'Accessories', quantityType: 'fixed', reason: 'Golf essential', activities: ['Golf'] },
    { name: 'Golf hat / visor', category: 'Accessories', quantityType: 'fixed', reason: 'Golf essential', activities: ['Golf'] },
    { name: 'Sunscreen', category: 'Toiletries', quantityType: 'fixed', reason: 'Golf essential', activities: ['Golf'] },
    { name: 'Golf socks', category: 'Clothing', quantityType: 'per_activity', reason: 'Golf attire', activities: ['Golf'] },
    { name: 'Rain jacket', category: 'Clothing', quantityType: 'fixed', reason: 'Golf essential', activities: ['Golf'] },
  ],
  Hiking: [
    { name: 'Hiking boots', category: 'Shoes', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Moisture-wicking t-shirt', category: 'Clothing', quantityType: 'per_night', reason: 'Hiking attire', activities: ['Hiking'] },
    { name: 'Hiking socks', category: 'Clothing', quantityType: 'per_night', reason: 'Hiking attire', activities: ['Hiking'] },
    { name: 'Hiking trousers', category: 'Clothing', quantityType: 'fixed', reason: 'Hiking attire', activities: ['Hiking'] },
    { name: 'Daypack / backpack', category: 'Equipment', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Water bottle', category: 'Equipment', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Blister plasters', category: 'Toiletries', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Sunscreen', category: 'Toiletries', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Insect repellent', category: 'Toiletries', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
    { name: 'Headlamp', category: 'Equipment', quantityType: 'fixed', reason: 'Hiking essential', activities: ['Hiking'] },
  ],
  Ski: [
    { name: 'Ski jacket', category: 'Clothing', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Ski trousers', category: 'Clothing', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Thermal base layer top', category: 'Clothing', quantityType: 'per_night', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Thermal base layer bottoms', category: 'Clothing', quantityType: 'per_night', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Ski socks', category: 'Clothing', quantityType: 'per_night', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Ski gloves', category: 'Accessories', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Ski goggles', category: 'Accessories', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Helmet', category: 'Equipment', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Lip balm with SPF', category: 'Toiletries', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
    { name: 'Hand warmers', category: 'Accessories', quantityType: 'fixed', reason: 'Ski essential', activities: ['Ski'] },
  ],
  'Formal Dinner': [
    { name: 'Formal dress / suit', category: 'Clothing', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Dress shoes', category: 'Shoes', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Tie / bow tie', category: 'Accessories', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Cufflinks', category: 'Accessories', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Dress watch', category: 'Accessories', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Evening bag / clutch', category: 'Accessories', quantityType: 'fixed', reason: 'Formal attire', activities: ['Formal Dinner'] },
    { name: 'Cologne / perfume', category: 'Toiletries', quantityType: 'fixed', reason: 'Formal essential', activities: ['Formal Dinner'] },
    { name: 'Lint roller', category: 'Accessories', quantityType: 'fixed', reason: 'Formal essential', activities: ['Formal Dinner'] },
  ],
  Casual: [
    { name: 'T-shirts', category: 'Clothing', quantityType: 'per_night', reason: 'Casual attire', activities: ['Casual'] },
    { name: 'Jeans', category: 'Clothing', quantityType: 'fixed', reason: 'Casual attire', activities: ['Casual'] },
    { name: 'Shorts', category: 'Clothing', quantityType: 'fixed', reason: 'Casual attire', activities: ['Casual'] },
    { name: 'Trainers / sneakers', category: 'Shoes', quantityType: 'fixed', reason: 'Casual attire', activities: ['Casual'] },
    { name: 'Hoodie / sweatshirt', category: 'Clothing', quantityType: 'fixed', reason: 'Casual layer', activities: ['Casual'] },
    { name: 'Underwear', category: 'Clothing', quantityType: 'per_night', reason: 'Casual essential', activities: ['Casual'] },
    { name: 'Socks', category: 'Clothing', quantityType: 'per_night', reason: 'Casual essential', activities: ['Casual'] },
  ],
  'City Sightseeing': [
    { name: 'Comfortable walking shoes', category: 'Shoes', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Day bag / tote', category: 'Accessories', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Portable power bank', category: 'Equipment', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Sunglasses', category: 'Accessories', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Light jacket', category: 'Clothing', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Travel umbrella', category: 'Accessories', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Camera', category: 'Equipment', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
    { name: 'Reusable water bottle', category: 'Equipment', quantityType: 'fixed', reason: 'Sightseeing essential', activities: ['City Sightseeing'] },
  ],
};

export function buildTemplateList(activityNames: string[]): InventorySuggestion[] {
  const seen = new Set<string>();
  const result: InventorySuggestion[] = [];

  function addItem(item: InventorySuggestion) {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  for (const name of activityNames) {
    const items = ACTIVITY_TEMPLATES[name] ?? [];
    for (const item of items) addItem(item);
  }

  for (const item of UNIVERSAL_ESSENTIALS) addItem(item);

  return result;
}
