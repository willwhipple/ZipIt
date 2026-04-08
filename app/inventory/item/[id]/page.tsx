'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity, CategoryType, QuantityType } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';

const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

export default function EditItemPage() {
  const router = useRouter();
  const { id: itemId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType>('Clothing');
  const [quantityType, setQuantityType] = useState<QuantityType>('fixed');
  const [essential, setEssential] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  const [activityError, setActivityError] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const [itemRes, activitiesRes, itemActivitiesRes] = await Promise.all([
        supabase.from('items').select('*').eq('id', itemId).single(),
        supabase.from('activities').select('*').order('name'),
        supabase.from('item_activities').select('activity_id').eq('item_id', itemId),
      ]);

      if (itemRes.data) {
        setName(itemRes.data.name);
        setCategory(itemRes.data.category as CategoryType);
        setQuantityType(itemRes.data.quantity_type as QuantityType);
        setEssential(itemRes.data.essential ?? false);
      }
      if (activitiesRes.data) setActivities(activitiesRes.data as Activity[]);
      if (itemActivitiesRes.data) {
        setSelectedActivityIds(itemActivitiesRes.data.map((r: { activity_id: string }) => r.activity_id));
      }

      setLoading(false);
    }

    fetchData();
  }, [itemId]);

  function toggleActivity(id: string) {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function addActivity() {
    setActivityError('');
    if (!newActivityName.trim()) return setActivityError('Please enter an activity name.');
    setAddingActivity(true);

    const { data, error: insertError } = await supabase
      .from('activities')
      .insert({ name: newActivityName.trim() })
      .select()
      .single();

    if (insertError || !data) {
      setActivityError('Could not create activity. It may already exist.');
      setAddingActivity(false);
      return;
    }

    setActivities((prev) =>
      [...prev, data as Activity].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSelectedActivityIds((prev) => [...prev, data.id]);
    setNewActivityName('');
    setShowNewActivity(false);
    setAddingActivity(false);
  }

  async function handleSave() {
    setError('');
    if (!name.trim()) return setError('Please enter an item name.');

    setSaving(true);

    const { error: updateError } = await supabase
      .from('items')
      .update({ name: name.trim(), category, quantity_type: quantityType, essential })
      .eq('id', itemId);

    if (updateError) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    // Replace all activity associations
    await supabase.from('item_activities').delete().eq('item_id', itemId);
    if (selectedActivityIds.length > 0) {
      await supabase.from('item_activities').insert(
        selectedActivityIds.map((activity_id) => ({ item_id: itemId, activity_id }))
      );
    }

    router.back();
  }

  if (loading) {
    return <LuggageSpinner />;
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-gray-100 bg-sky-50">
        <button onClick={() => router.back()} className="text-sky-500 text-sm font-medium">
          ← Back
        </button>
        <h1 className="text-lg font-semibold flex-1">Edit Item</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sky-500 text-sm font-semibold disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  category === cat
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
          <div className="flex flex-col gap-2">
            {QUANTITY_TYPES.map(({ value, label, description }) => (
              <button
                key={value}
                onClick={() => setQuantityType(value)}
                className={`flex items-start gap-3 px-3 py-3 rounded-xl border text-left transition-colors ${
                  quantityType === value
                    ? 'border-sky-500 bg-sky-50'
                    : 'border-gray-200'
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    quantityType === value ? 'border-sky-500' : 'border-gray-300'
                  }`}
                >
                  {quantityType === value && (
                    <div className="w-2 h-2 rounded-full bg-sky-500" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${quantityType === value ? 'text-sky-700' : 'text-gray-800'}`}>
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
              checked={essential}
              onChange={(e) => setEssential(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>

        {/* Activities — hidden when essential */}
        {!essential && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
            <div className="flex flex-wrap gap-2">
              {activities.map((a) => {
                const selected = selectedActivityIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleActivity(a.id)}
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

            {/* Inline new activity form */}
            {showNewActivity ? (
              <div className="mt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newActivityName}
                    onChange={(e) => setNewActivityName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addActivity()}
                    placeholder="Activity name"
                    autoFocus
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={addActivity}
                    disabled={addingActivity}
                    className="px-3 py-2 bg-sky-500 text-white text-sm font-medium rounded-xl disabled:opacity-40"
                  >
                    {addingActivity ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowNewActivity(false); setNewActivityName(''); setActivityError(''); }}
                    className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
                {activityError && (
                  <p className="text-xs text-red-500 mt-1">{activityError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowNewActivity(true)}
                className="mt-2 text-sm text-sky-500 font-medium"
              >
                + New activity
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
