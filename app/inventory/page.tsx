'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import type { Item, CategoryType, InventorySuggestion } from '@/types';

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

  // AI inventory prefill
  const [showAIPrefill, setShowAIPrefill] = useState(false);
  const [travelStyle, setTravelStyle] = useState('');
  const [aiPrefillLoading, setAiPrefillLoading] = useState(false);
  const [aiPrefillError, setAiPrefillError] = useState('');
  const [inventorySuggestions, setInventorySuggestions] = useState<InventorySuggestion[]>([]);
  const [addingInventorySuggestion, setAddingInventorySuggestion] = useState<string | null>(null);

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

  async function loadInventorySuggestions() {
    setAiPrefillLoading(true);
    setAiPrefillError('');
    setInventorySuggestions([]);

    const existingItemNames = items.map((i) => i.name);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest_inventory_items',
          travelStyle: travelStyle.trim(),
          existingItemNames,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setAiPrefillError("Couldn't get suggestions right now. Try again later.");
      } else {
        setInventorySuggestions(data.suggestions ?? []);
        if ((data.suggestions ?? []).length === 0) {
          setAiPrefillError("No suggestions based on that description. Try being more specific.");
        }
      }
    } catch {
      setAiPrefillError("Couldn't get suggestions right now. Try again later.");
    } finally {
      setAiPrefillLoading(false);
    }
  }

  async function addInventorySuggestion(suggestion: InventorySuggestion) {
    setAddingInventorySuggestion(suggestion.name);

    const { data: newItem, error } = await supabase
      .from('items')
      .insert({
        name: suggestion.name,
        category: suggestion.category,
        quantity_type: suggestion.quantityType,
        essential: false,
      })
      .select('*, item_activities(activity_id)')
      .single();

    if (!error && newItem) {
      setItems((prev) => [...prev, newItem as ItemWithActivities]);
      setInventorySuggestions((prev) => prev.filter((s) => s.name !== suggestion.name));
    }

    setAddingInventorySuggestion(null);
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
            onClick={() => { setShowAIPrefill(true); setTravelStyle(''); setInventorySuggestions([]); setAiPrefillError(''); }}
            className="text-sm text-blue-500 font-medium px-3 py-2"
          >
            ✦ AI
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
          <button
            onClick={() => { setShowAIPrefill(true); setTravelStyle(''); setInventorySuggestions([]); setAiPrefillError(''); }}
            className="text-blue-500 text-sm font-medium"
          >
            ✦ Or build with AI
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

      {/* AI inventory prefill modal */}
      {showAIPrefill && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold">Build Inventory with AI</h3>
              <button
                onClick={() => setShowAIPrefill(false)}
                className="text-gray-400 text-sm font-medium"
              >
                Done
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">
              {/* Input — shown until suggestions appear */}
              {inventorySuggestions.length === 0 && !aiPrefillLoading && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    Describe how you travel and we'll suggest items for your inventory.
                  </p>
                  <textarea
                    value={travelStyle}
                    onChange={(e) => setTravelStyle(e.target.value)}
                    placeholder='e.g. "I mostly travel for business, occasional weekend hiking trips, always carry-on only"'
                    rows={3}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  {aiPrefillError && (
                    <p className="text-xs text-red-500 mt-1">{aiPrefillError}</p>
                  )}
                  <button
                    onClick={loadInventorySuggestions}
                    disabled={!travelStyle.trim()}
                    className="mt-3 w-full bg-blue-500 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50"
                  >
                    Get Suggestions
                  </button>
                </div>
              )}

              {aiPrefillLoading && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">Thinking…</span>
                </div>
              )}

              {!aiPrefillLoading && inventorySuggestions.length > 0 && (
                <>
                  <p className="text-xs text-gray-400">
                    Tap Add to include an item in your inventory. You can assign activities after.
                  </p>
                  <div className="flex flex-col gap-2">
                    {inventorySuggestions.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{s.reason}</p>
                          <div className="flex gap-1.5 mt-1">
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {s.category}
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {s.quantityType.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => addInventorySuggestion(s)}
                          disabled={addingInventorySuggestion === s.name}
                          className="flex-shrink-0 bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
                        >
                          {addingInventorySuggestion === s.name ? '…' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setInventorySuggestions([]); setTravelStyle(''); setAiPrefillError(''); }}
                    className="text-sm text-gray-400 font-medium py-2 text-center"
                  >
                    Start over
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
