'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';

export default function ActivitiesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

  async function fetchActivities() {
    setLoading(true);
    const { data } = await supabase.from('activities').select('*').order('name');
    if (data) setActivities(data as Activity[]);
    setLoading(false);
  }

  async function addActivity() {
    setError('');
    const trimmed = newName.trim();
    if (!trimmed) return setError('Please enter an activity name.');

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('activities')
      .insert({ name: trimmed })
      .select()
      .single();

    if (insertError || !data) {
      setError('Failed to add activity. It may already exist.');
    } else {
      setActivities((prev) => [...prev, data as Activity].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    }
    setAdding(false);
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;

    await supabase.from('activities').update({ name: trimmed }).eq('id', id);
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: trimmed } : a))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
  }

  async function confirmDelete(id: string) {
    setDeleteError('');
    // Check if any items are assigned
    const { data } = await supabase
      .from('item_activities')
      .select('item_id')
      .eq('activity_id', id)
      .limit(1);

    if (data && data.length > 0) {
      setDeleteError('This activity has items assigned to it. Remove those items first.');
      setDeleteConfirm(null);
      return;
    }

    await supabase.from('activities').delete().eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    setDeleteConfirm(null);
  }

  if (loading) {
    return <LuggageSpinner />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-gray-100 bg-sky-50">
        <button onClick={() => router.back()} className="text-sky-500 text-sm font-medium">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Activities</h1>
      </div>

      {/* Add new activity */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addActivity()}
            placeholder="New activity name"
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={addActivity}
            disabled={adding}
            className="bg-sky-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        {deleteError && <p className="text-xs text-red-500 mt-2">{deleteError}</p>}
      </div>

      {/* Activity list */}
      {activities.map((activity) => (
        <div key={activity.id} className="border-b border-gray-100 bg-white">
          {editingId === activity.id ? (
            <div className="flex items-center gap-2 px-4 py-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(activity.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                onClick={() => saveEdit(activity.id)}
                className="text-sm text-sky-500 font-semibold"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-sm text-gray-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-900">{activity.name}</span>
              <div className="flex gap-3">
                <button
                  onClick={() => { setEditingId(activity.id); setEditName(activity.name); setDeleteError(''); }}
                  className="text-sm text-sky-500 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => { setDeleteConfirm(activity.id); setDeleteError(''); }}
                  className="text-sm text-red-400 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {activities.length === 0 && (
        <div className="px-4 py-12 text-center text-gray-400 text-sm">
          No activities yet. Add one above.
        </div>
      )}

      {/* Delete confirm overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">Delete Activity?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This activity will be removed. Items assigned to it will lose this activity tag.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmDelete(deleteConfirm)}
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
