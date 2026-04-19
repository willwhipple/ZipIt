'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity, CategoryType, QuantityType } from '@/types';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { Toggle } from '@/components/ui/Toggle';
import { PrimaryBtn, SecondaryBtn } from '@/components/ui/Button';

const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

export default function CreateItemPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType>('Clothing');
  const [quantityType, setQuantityType] = useState<QuantityType>('fixed');
  const [essential, setEssential] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  const [activityError, setActivityError] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);

  useEffect(() => {
    supabase
      .from('activities')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setActivities(data as Activity[]);
      });
  }, []);

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

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({ name: name.trim(), category, quantity_type: quantityType, essential })
      .select()
      .single();

    if (itemError || !item) {
      setError('Failed to save item. Please try again.');
      setSaving(false);
      return;
    }

    if (selectedActivityIds.length > 0) {
      await supabase.from('item_activities').insert(
        selectedActivityIds.map((activity_id) => ({ item_id: item.id, activity_id }))
      );
    }

    router.back();
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        leading={
          <HeaderIconBtn onClick={() => router.back()} aria-label="Back">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </HeaderIconBtn>
        }
        title="Add item"
      />

      <div className="flex flex-col gap-5 px-4 py-5">
        <Input label="Name" value={name} onChange={setName} placeholder="e.g. Golf shirt" />

        <div>
          <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>{cat}</Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Quantity</p>
          <div className="flex flex-col gap-2">
            {QUANTITY_TYPES.map(({ value, label, description }) => (
              <button key={value} type="button" onClick={() => setQuantityType(value)} className="flex items-start gap-3 px-3 py-3 text-left"
                style={{ borderRadius: 'var(--zi-r-lg)', border: `1px solid ${quantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`, background: quantityType === value ? 'var(--zi-brand-tint)' : 'transparent' }}>
                <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: quantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}>
                  {quantityType === value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--zi-border)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Essential</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Always packed on every trip</p>
          </div>
          <Toggle on={essential} onChange={setEssential} />
        </div>

        {!essential && (
          <div>
            <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--zi-text)' }}>Activities</p>
            <p className="text-xs mb-2" style={{ color: 'var(--zi-text-subtle)' }}>
              This item will appear in packing lists for trips with these activities.
            </p>
            <div className="flex flex-wrap gap-2">
              {activities.map((a) => (
                <Chip key={a.id} selected={selectedActivityIds.includes(a.id)} onClick={() => toggleActivity(a.id)}>{a.name}</Chip>
              ))}
            </div>
            {showNewActivity ? (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addActivity()}
                  placeholder="Activity name"
                  autoFocus
                  className="flex-1 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--zi-brand)]"
                  style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                />
                <SecondaryBtn onClick={addActivity} disabled={addingActivity}>{addingActivity ? '…' : 'Add'}</SecondaryBtn>
                <SecondaryBtn onClick={() => { setShowNewActivity(false); setNewActivityName(''); setActivityError(''); }}>Cancel</SecondaryBtn>
                {activityError && <p className="text-xs mt-1" style={{ color: 'var(--zi-danger)' }}>{activityError}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewActivity(true)} className="mt-2 text-sm font-medium" style={{ color: 'var(--zi-brand)' }}>
                + New activity
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm px-3 py-2 rounded-[var(--zi-r-lg)]" style={{ background: 'var(--zi-danger-tint)', color: 'var(--zi-danger)', border: '1px solid rgba(239,68,68,.2)' }}>
            {error}
          </p>
        )}

        <PrimaryBtn onClick={handleSave} disabled={saving} full className="mt-2 py-4">
          {saving ? 'Saving…' : 'Save item'}
        </PrimaryBtn>
      </div>
    </div>
  );
}
