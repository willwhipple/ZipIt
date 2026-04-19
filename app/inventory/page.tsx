'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Item, Activity, CategoryType, QuantityType, InventorySuggestion } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { CategoryHeader, ListRow } from '@/components/ui/ListRow';
import { PrimaryBtn, SecondaryBtn, DangerBtn } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { Toggle } from '@/components/ui/Toggle';

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
      <PageHeader
        title="My stuff"
        trailing={
          <>
            <HeaderIconBtn onClick={() => router.push('/activities')} aria-label="Activities">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
              </svg>
            </HeaderIconBtn>
            <HeaderIconBtn
              onClick={() => { setShowAIPrefill(true); setExtraContext(''); setInventorySuggestions([]); setAiPrefillError(''); setEditingSuggestion(null); }}
              aria-label="Smart suggestions"
            >
              <span style={{ fontSize: 16 }}>✦</span>
            </HeaderIconBtn>
            <HeaderIconBtn onClick={() => router.push('/inventory/item/create')} label="Add item">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </HeaderIconBtn>
          </>
        }
      />

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-3">
          <div className="text-4xl">📦</div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--zi-text)' }}>No items yet</h2>
          <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
            Add items to your inventory so you can generate packing lists for trips.
          </p>
          <PrimaryBtn onClick={() => router.push('/inventory/item/create')} className="mt-2">
            Add your first item
          </PrimaryBtn>
          <button
            onClick={() => { setShowAIPrefill(true); setExtraContext(''); setInventorySuggestions([]); setAiPrefillError(''); setEditingSuggestion(null); }}
            className="text-sm font-medium"
            style={{ color: 'var(--zi-smart)' }}
          >
            ✦ Or use Smart Suggestions
          </button>
        </div>
      )}

      {/* Grouped list */}
      {grouped.map(({ category, items: categoryItems }) => (
        <div key={category}>
          <CategoryHeader name={category} meta={String(categoryItems.length)} />
          {categoryItems.map((item) => (
            <ListRow
              key={item.id}
              trailing={
                <div className="flex gap-3">
                  <button onClick={() => router.push(`/inventory/item/${item.id}`)} className="text-sm font-medium" style={{ color: 'var(--zi-brand)' }}>Edit</button>
                  <button onClick={() => setDeleteConfirm(item.id)} className="text-sm font-medium" style={{ color: 'var(--zi-danger)' }}>Delete</button>
                </div>
              }
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--zi-text)' }}>{item.name}</p>
                <p style={{ fontSize: 12, color: 'var(--zi-text-subtle)', marginTop: 1 }} className="capitalize">{item.quantity_type.replace('_', ' ')}</p>
              </div>
            </ListRow>
          ))}
          <div style={{ height: 1, background: 'var(--zi-border)', margin: '0 20px' }} />
        </div>
      ))}

      {/* Smart Suggestions sheet */}
      {showAIPrefill && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[85vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--zi-border)' }}>
              <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--zi-smart-deep)' }}>
                <span style={{ color: 'var(--zi-smart)' }}>✦</span> Smart suggestions
              </h3>
              <button onClick={() => setShowAIPrefill(false)} className="text-sm font-medium" style={{ color: 'var(--zi-text-muted)' }}>Done</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">
              {editingSuggestion && (
                <div className="flex flex-col gap-4">
                  <button onClick={() => setEditingSuggestion(null)} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>← Back to suggestions</button>
                  <Input label="Name" value={editName} onChange={setEditName} />
                  <div>
                    <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Category</p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => <Chip key={cat} selected={editCategory === cat} onClick={() => setEditCategory(cat)}>{cat}</Chip>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Quantity</p>
                    <div className="flex flex-col gap-2">
                      {QUANTITY_TYPES.map(({ value, label, description }) => (
                        <button key={value} type="button" onClick={() => setEditQuantityType(value)} className="flex items-start gap-3 px-3 py-3 text-left"
                          style={{ borderRadius: 'var(--zi-r-lg)', border: `1px solid ${editQuantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`, background: editQuantityType === value ? 'var(--zi-brand-tint)' : 'transparent' }}>
                          <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                            style={{ borderColor: editQuantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}>
                            {editQuantityType === value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
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
                    <Toggle on={editEssential} onChange={setEditEssential} />
                  </div>
                  {!editEssential && activities.length > 0 && (
                    <div>
                      <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Activities</p>
                      <div className="flex flex-wrap gap-2">
                        {activities.map((a) => {
                          const selected = editActivityIds.includes(a.id);
                          return <Chip key={a.id} selected={selected} onClick={() => setEditActivityIds((prev) => selected ? prev.filter((id) => id !== a.id) : [...prev, a.id])}>{a.name}</Chip>;
                        })}
                      </div>
                    </div>
                  )}
                  <PrimaryBtn onClick={handleEditSave} disabled={savingEdit || !editName.trim()} full>
                    {savingEdit ? 'Saving…' : 'Save & add to inventory'}
                  </PrimaryBtn>
                </div>
              )}

              {!editingSuggestion && inventorySuggestions.length === 0 && !aiPrefillLoading && (
                <div>
                  <p className="text-sm mb-3" style={{ color: 'var(--zi-text-muted)' }}>
                    We&apos;ll include the About You section from your profile. Add any extra context below too.
                  </p>
                  <textarea
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                    placeholder='e.g. "Heading to Japan for two weeks" or "ski gear, formal dinner, carry-on only"'
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                    style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                  />
                  {aiPrefillError && <p className="text-xs mt-1" style={{ color: 'var(--zi-danger)' }}>{aiPrefillError}</p>}
                  <button onClick={loadInventorySuggestions} className="mt-3 w-full text-white text-sm font-semibold py-3"
                    style={{ background: 'var(--zi-smart-lo)', borderRadius: 'var(--zi-r-lg)', border: 'none', cursor: 'pointer' }}>
                    Get suggestions
                  </button>
                </div>
              )}

              {!editingSuggestion && aiPrefillLoading && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-smart)' }} />
                  <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Thinking…</span>
                </div>
              )}

              {!editingSuggestion && !aiPrefillLoading && inventorySuggestions.length > 0 && (
                <>
                  <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>
                    Tap Add to include an item in your inventory.
                  </p>
                  {CATEGORY_ORDER.map((cat) => {
                    const catSuggestions = inventorySuggestions.filter((s) => s.category === cat);
                    if (catSuggestions.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div className="py-1.5" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--zi-text-subtle)' }}>{cat}</span>
                        </div>
                        {catSuggestions.map((s) => (
                          <div key={s.name} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{s.name}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{s.reason}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-xs px-2 py-0.5" style={{ color: 'var(--zi-text-subtle)', background: 'var(--zi-border)', borderRadius: 'var(--zi-r-pill)' }}>{s.quantityType.replace('_', ' ')}</span>
                                {s.activities.map((act) => (
                                  <span key={act} className="text-xs px-2 py-0.5" style={{ color: 'var(--zi-smart-deep)', background: 'var(--zi-smart-tint)', borderRadius: 'var(--zi-r-pill)' }}>{act}</span>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <SecondaryBtn onClick={() => openEditForm(s)}>Edit</SecondaryBtn>
                              <button onClick={() => addInventorySuggestion(s)} disabled={addingInventorySuggestion === s.name}
                                className="text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                                style={{ background: 'var(--zi-smart)', borderRadius: 'var(--zi-r-pill)', border: 'none', cursor: 'pointer' }}>
                                {addingInventorySuggestion === s.name ? '…' : 'Add'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <button onClick={() => { setInventorySuggestions([]); setExtraContext(''); setAiPrefillError(''); }}
                    className="text-sm font-medium py-2 text-center" style={{ color: 'var(--zi-text-subtle)' }}>
                    Start over
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pt-4">
            <div className="sheet-handle" />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--zi-text)' }}>Delete item?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--zi-text-muted)' }}>
              This will remove the item from your inventory. It won&apos;t affect existing packing lists.
            </p>
            <div className="flex flex-col gap-2">
              <DangerBtn onClick={() => deleteItem(deleteConfirm)} full>Delete</DangerBtn>
              <SecondaryBtn onClick={() => setDeleteConfirm(null)} full>Cancel</SecondaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
