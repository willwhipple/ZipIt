'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Item, Activity, CategoryType, QuantityType, InventorySuggestion } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import SuitcaseIcon from '@/components/SuitcaseIcon';

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

const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

export default function InventoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<ItemWithActivities[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Smart Suggestions inventory prefill
  const [showAIPrefill, setShowAIPrefill] = useState(false);
  const [aboutMe, setAboutMe] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [aiPrefillLoading, setAiPrefillLoading] = useState(false);
  const [aiPrefillError, setAiPrefillError] = useState('');
  const [inventorySuggestions, setInventorySuggestions] = useState<InventorySuggestion[]>([]);
  const [addingInventorySuggestion, setAddingInventorySuggestion] = useState<string | null>(null);

  // Activities (loaded on mount — needed for AI call and edit form)
  const [activities, setActivities] = useState<Activity[]>([]);

  // Inline edit form within the AI modal
  const [editingSuggestion, setEditingSuggestion] = useState<InventorySuggestion | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryType>('Clothing');
  const [editQuantityType, setEditQuantityType] = useState<QuantityType>('fixed');
  const [editEssential, setEditEssential] = useState(false);
  const [editActivityIds, setEditActivityIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchAboutMe();
    loadActivities();
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

  async function fetchAboutMe() {
    const { data } = await supabase
      .from('user_preferences')
      .select('about_me')
      .limit(1)
      .maybeSingle();
    if (data?.about_me) setAboutMe(data.about_me);
  }

  async function loadActivities() {
    const { data } = await supabase.from('activities').select('*').order('name');
    if (data) setActivities(data as Activity[]);
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
          aboutMe: aboutMe || undefined,
          extraContext: extraContext.trim() || undefined,
          existingItemNames,
          activityNames: activities.map((a) => a.name),
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

  // Resolve activity names from a suggestion to IDs using the loaded activities list
  function resolveActivityIds(activityNames: string[]): string[] {
    return activityNames
      .map((name) => activities.find((a) => a.name === name)?.id)
      .filter((id): id is string => !!id);
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
      .select('id')
      .single();

    if (!error && newItem) {
      const matchedIds = resolveActivityIds(suggestion.activities);
      if (matchedIds.length > 0) {
        await supabase.from('item_activities').insert(
          matchedIds.map((activity_id) => ({ item_id: newItem.id, activity_id }))
        );
      }
      // Re-fetch the item with its activities so local state is accurate
      const { data: refetched } = await supabase
        .from('items')
        .select('*, item_activities(activity_id)')
        .eq('id', newItem.id)
        .single();
      if (refetched) setItems((prev) => [...prev, refetched as ItemWithActivities]);
      setInventorySuggestions((prev) => prev.filter((s) => s.name !== suggestion.name));
    }

    setAddingInventorySuggestion(null);
  }

  async function handleEditSave() {
    if (!editName.trim() || !editingSuggestion) return;
    setSavingEdit(true);

    const { data: newItem, error } = await supabase
      .from('items')
      .insert({
        name: editName.trim(),
        category: editCategory,
        quantity_type: editQuantityType,
        essential: editEssential,
      })
      .select('id')
      .single();

    if (!error && newItem) {
      if (editActivityIds.length > 0) {
        await supabase.from('item_activities').insert(
          editActivityIds.map((activity_id) => ({ item_id: newItem.id, activity_id }))
        );
      }
      // Re-fetch with activities so local state is accurate
      const { data: refetched } = await supabase
        .from('items')
        .select('*, item_activities(activity_id)')
        .eq('id', newItem.id)
        .single();
      if (refetched) setItems((prev) => [...prev, refetched as ItemWithActivities]);
      setInventorySuggestions((prev) => prev.filter((s) => s.name !== editingSuggestion.name));
    }

    setEditingSuggestion(null);
    setSavingEdit(false);
  }

  function openEditForm(s: InventorySuggestion) {
    setEditingSuggestion(s);
    setEditName(s.name);
    setEditCategory(s.category);
    setEditQuantityType(s.quantityType);
    setEditEssential(false);
    setEditActivityIds(resolveActivityIds(s.activities));
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
    return <LuggageSpinner />;
  }

  return (
    <div>
      {/* Header — two rows */}
      <div className="header-noise px-4 pt-12 pb-4 bg-gradient-to-b from-sky-50 to-white">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-logo text-sky-500">My Stuff</h1>
          <button
            onClick={() => router.push('/inventory/item/create')}
            className="bg-gradient-to-b from-sky-400 to-sky-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-sky-sm"
          >
            + Add Item
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={() => router.push('/activities')}
            className="text-sm text-sky-500 font-medium py-1"
          >
            Activities
          </button>
          <button
            onClick={() => {
              setShowAIPrefill(true);
              setExtraContext('');
              setInventorySuggestions([]);
              setAiPrefillError('');
              setEditingSuggestion(null);
            }}
            className="text-sm text-teal-400 font-medium py-1"
          >
            ✦ Smart Suggestions
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
            className="mt-2 bg-gradient-to-b from-sky-400 to-sky-600 text-white font-semibold px-6 py-3 rounded-xl shadow-sky-sm"
          >
            Add Your First Item
          </button>
          <button
            onClick={() => {
              setShowAIPrefill(true);
              setExtraContext('');
              setInventorySuggestions([]);
              setAiPrefillError('');
              setEditingSuggestion(null);
            }}
            className="text-teal-400 text-sm font-medium"
          >
            ✦ Or use Smart Suggestions
          </button>
        </div>
      )}

      {/* Grouped list */}
      {grouped.map(({ category, items: categoryItems }) => (
        <div key={category} className="mb-2">
          <div className="px-4 py-2 bg-white border-b border-gray-50">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
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
                  className="text-sm text-sky-500 font-medium"
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

      {/* Smart Suggestions inventory prefill modal */}
      {showAIPrefill && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[85vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold text-teal-600">✦ Smart Suggestions</h3>
              <button
                onClick={() => setShowAIPrefill(false)}
                className="text-gray-400 text-sm font-medium"
              >
                Done
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">

              {/* ── Edit form view ── */}
              {editingSuggestion && (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setEditingSuggestion(null)}
                    className="text-sm text-sky-500 font-medium self-start"
                  >
                    ← Back to suggestions
                  </button>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setEditCategory(cat)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            editCategory === cat
                              ? 'bg-sky-500 text-white border-sky-500'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                    <div className="flex flex-col gap-2">
                      {QUANTITY_TYPES.map(({ value, label, description }) => (
                        <button
                          key={value}
                          onClick={() => setEditQuantityType(value)}
                          className={`flex items-start gap-3 px-3 py-3 rounded-xl border text-left transition-colors ${
                            editQuantityType === value ? 'border-sky-500 bg-sky-50' : 'border-gray-200'
                          }`}
                        >
                          <div
                            className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                              editQuantityType === value ? 'border-sky-500' : 'border-gray-300'
                            }`}
                          >
                            {editQuantityType === value && (
                              <div className="w-2 h-2 rounded-full bg-sky-500" />
                            )}
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${editQuantityType === value ? 'text-sky-700' : 'text-gray-800'}`}>
                              {label}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Essential toggle */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Essential</p>
                      <p className="text-xs text-gray-400 mt-0.5">Always packed on every trip</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editEssential}
                        onChange={(e) => setEditEssential(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                    </label>
                  </div>

                  {/* Activities */}
                  {!editEssential && activities.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
                      <div className="flex flex-wrap gap-2">
                        {activities.map((a) => {
                          const selected = editActivityIds.includes(a.id);
                          return (
                            <button
                              key={a.id}
                              onClick={() =>
                                setEditActivityIds((prev) =>
                                  selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                                )
                              }
                              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                selected
                                  ? 'bg-sky-500 text-white border-sky-500'
                                  : 'bg-white text-gray-600 border-gray-300'
                              }`}
                            >
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleEditSave}
                    disabled={savingEdit || !editName.trim()}
                    className="w-full bg-gradient-to-b from-sky-400 to-sky-600 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50 shadow-sky-sm"
                  >
                    {savingEdit ? 'Saving…' : 'Save & Add to Inventory'}
                  </button>
                </div>
              )}

              {/* ── Input form view ── */}
              {!editingSuggestion && inventorySuggestions.length === 0 && !aiPrefillLoading && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    We&apos;ll include the About You section from your profile. Add any extra context below too — it can be a description, a list of things, or both.
                  </p>
                  <textarea
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                    placeholder='e.g. "Heading to Japan for two weeks" or "ski gear, formal dinner, carry-on only"'
                    rows={3}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                  {aiPrefillError && (
                    <p className="text-xs text-red-500 mt-1">{aiPrefillError}</p>
                  )}
                  <button
                    onClick={loadInventorySuggestions}
                    className="mt-3 w-full bg-gradient-to-b from-teal-400 to-teal-500 text-white text-sm font-semibold py-3 rounded-xl shadow-teal"
                  >
                    Get Suggestions
                  </button>
                </div>
              )}

              {/* ── Loading view ── */}
              {!editingSuggestion && aiPrefillLoading && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <SuitcaseIcon size={20} className="luggage-spin-icon text-teal-400" />
                  <span className="text-sm text-gray-500">Thinking…</span>
                </div>
              )}

              {/* ── Suggestions list view — grouped by category ── */}
              {!editingSuggestion && !aiPrefillLoading && inventorySuggestions.length > 0 && (
                <>
                  <p className="text-xs text-gray-400">
                    Tap Add to include an item in your inventory. Activities are pre-assigned based on the suggestion.
                  </p>
                  {CATEGORY_ORDER.map((cat) => {
                    const catSuggestions = inventorySuggestions.filter((s) => s.category === cat);
                    if (catSuggestions.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div className="py-1.5 border-b border-gray-50">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                            {cat}
                          </span>
                        </div>
                        {catSuggestions.map((s) => (
                          <div
                            key={s.name}
                            className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{s.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{s.reason}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {s.quantityType.replace('_', ' ')}
                                </span>
                                {s.activities.map((act) => (
                                  <span key={act} className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                                    {act}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => openEditForm(s)}
                                className="text-xs text-gray-500 font-medium px-3 py-1.5 rounded-full border border-gray-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => addInventorySuggestion(s)}
                                disabled={addingInventorySuggestion === s.name}
                                className="bg-teal-400 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
                              >
                                {addingInventorySuggestion === s.name ? '…' : 'Add'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => { setInventorySuggestions([]); setExtraContext(''); setAiPrefillError(''); }}
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
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pt-4">
            <div className="sheet-handle" />
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
                className="w-full bg-white text-gray-700 font-semibold py-3 rounded-xl border border-gray-200 shadow-sm"
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
