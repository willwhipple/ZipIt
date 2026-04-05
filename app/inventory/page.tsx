'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import type { Item, CategoryType } from '@/types';

type ItemWithActivities = Item & {
  item_activities: { activity_id: string }[];
};

const CATEGORY_ORDER: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemWithActivities[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select('*, item_activities(activity_id)')
      .order('name');

    if (!error && data) setItems(data as ItemWithActivities[]);
    setLoading(false);
  }

  async function deleteItem(itemId: string) {
    const { error } = await supabase.from('items').delete().eq('id', itemId);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    }
    setDeleteConfirm(null);
  }

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <h1 className="text-2xl font-bold">My Stuff</h1>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/activities')}
            className="text-sm text-blue-500 font-medium px-3 py-2"
          >
            Activities
          </button>
          <button
            onClick={() => router.push('/inventory/item/create')}
            className="bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-full"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-3">
          <div className="text-4xl">📦</div>
          <h2 className="text-lg font-semibold text-gray-800">No items yet</h2>
          <p className="text-gray-500 text-sm">
            Add items to your inventory so you can generate packing lists for trips.
          </p>
          <button
            onClick={() => router.push('/inventory/item/create')}
            className="mt-2 bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl"
          >
            Add Your First Item
          </button>
        </div>
      )}

      {/* Grouped list */}
      {grouped.map(({ category, items: categoryItems }) => (
        <div key={category} className="mb-2">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {category}
            </span>
          </div>
          {categoryItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{item.quantity_type.replace('_', ' ')}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push(`/inventory/item/${item.id}`)}
                  className="text-sm text-blue-500 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(item.id)}
                  className="text-sm text-red-400 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">Delete Item?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This will remove the item from your inventory. It won&apos;t affect existing packing lists.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => deleteItem(deleteConfirm)}
                className="w-full bg-red-500 text-white font-semibold py-3 rounded-xl"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
