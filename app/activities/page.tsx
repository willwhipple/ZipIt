'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { PrimaryBtn, SecondaryBtn, DangerBtn } from '@/components/ui/Button';

export default function ActivitiesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
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
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await fetchActivities();
    }
    init();
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
      .insert({ name: trimmed, user_id: userId })
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
      <PageHeader
        leading={
          <HeaderIconBtn onClick={() => router.back()} aria-label="Back">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </HeaderIconBtn>
        }
        title="Activities"
      />

      {/* Add new activity */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--zi-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addActivity()}
            placeholder="New activity name"
            className="flex-1 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--zi-brand)]"
            style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
          />
          <PrimaryBtn onClick={addActivity} disabled={adding}>
            {adding ? '…' : 'Add'}
          </PrimaryBtn>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--zi-danger)' }}>{error}</p>}
        {deleteError && <p className="text-xs mt-2" style={{ color: 'var(--zi-danger)' }}>{deleteError}</p>}
      </div>

      {/* Activity list */}
      {activities.map((activity) => (
        <div key={activity.id} className="bg-white" style={{ borderBottom: '1px solid var(--zi-border)' }}>
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
                className="flex-1 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--zi-brand)]"
                style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              />
              <button onClick={() => saveEdit(activity.id)} className="text-sm font-semibold" style={{ color: 'var(--zi-brand)' }}>Save</button>
              <button onClick={() => setEditingId(null)} className="text-sm" style={{ color: 'var(--zi-text-subtle)' }}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-5 py-[10px] min-h-[40px]">
              <span className="text-sm" style={{ color: 'var(--zi-text)' }}>{activity.name}</span>
              <div className="flex gap-3">
                <button onClick={() => { setEditingId(activity.id); setEditName(activity.name); setDeleteError(''); }} className="text-sm font-medium" style={{ color: 'var(--zi-brand)' }}>Edit</button>
                <button onClick={() => { setDeleteConfirm(activity.id); setDeleteError(''); }} className="text-sm font-medium" style={{ color: 'var(--zi-danger)' }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {activities.length === 0 && (
        <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--zi-text-subtle)' }}>
          No activities yet. Add one above.
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pt-4">
            <div className="sheet-handle" />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--zi-text)' }}>Delete activity?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--zi-text-muted)' }}>
              This activity will be removed. Items assigned to it will lose this activity tag.
            </p>
            <div className="flex flex-col gap-2">
              <DangerBtn onClick={() => confirmDelete(deleteConfirm)} full>Delete</DangerBtn>
              <SecondaryBtn onClick={() => setDeleteConfirm(null)} full>Cancel</SecondaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
