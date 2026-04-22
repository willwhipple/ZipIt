'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Activity, CategoryType, InventorySuggestion, QuantityType } from '@/types';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { PrimaryBtn, SecondaryBtn } from '@/components/ui/Button';

const CATEGORY_ORDER: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

type Step = 'choose-path' | 'import' | 'review';
type ImportTab = 'upload' | 'paste';

interface Props {
  onDismiss: () => void;
  onComplete: () => void;
}

export default function OnboardingModal({ onDismiss, onComplete }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>('choose-path');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [aboutMe, setAboutMe] = useState('');
  const [prefsId, setPrefsId] = useState<string | null>(null);

  // AI generate state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Import state
  const [importTab, setImportTab] = useState<ImportTab>('upload');
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Review state
  const [reviewItems, setReviewItems] = useState<InventorySuggestion[]>([]);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<InventorySuggestion | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryType>('Clothing');
  const [editQty, setEditQty] = useState<QuantityType>('fixed');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    async function load() {
      const [actsResult, prefsResult] = await Promise.all([
        supabase.from('activities').select('*').order('name'),
        supabase.from('user_preferences').select('id, about_me').limit(1).maybeSingle(),
      ]);
      if (actsResult.data) setActivities(actsResult.data as Activity[]);
      if (prefsResult.data) {
        setPrefsId(prefsResult.data.id);
        setAboutMe(prefsResult.data.about_me ?? '');
      }
    }
    load();
  }, []);

  function resolveActivityIds(names: string[]): string[] {
    return names
      .map((n) => activities.find((a) => a.name === n)?.id)
      .filter((id): id is string => !!id);
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest_inventory_items',
          aboutMe: aboutMe || undefined,
          activityNames: activities.map((a) => a.name),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError("Couldn't get suggestions right now. Try again later.");
      } else {
        const items: InventorySuggestion[] = data.suggestions ?? [];
        setReviewItems(items);
        setCheckedNames(new Set(items.map((s) => s.name)));
        setStep('review');
      }
    } catch {
      setAiError("Couldn't get suggestions right now. Try again later.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleParseFile() {
    if (!selectedFile) return;
    setImportLoading(true);
    setImportError('');

    try {
      const isText = selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.md');
      if (isText) {
        const text = await selectedFile.text();
        await parseText(text);
      } else {
        const base64 = await fileToBase64(selectedFile);
        await parseFile(base64, selectedFile.type || 'application/octet-stream');
      }
    } catch {
      setImportError("Couldn't read the file. Try pasting the text instead.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handlePasteText() {
    if (!pasteText.trim()) return;
    setImportLoading(true);
    setImportError('');
    await parseText(pasteText.trim());
    setImportLoading(false);
  }

  async function parseText(text: string) {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'parse_packing_list',
        text,
        activityNames: activities.map((a) => a.name),
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setImportError("Couldn't parse the list. Try again or copy-paste the text.");
    } else {
      const items: InventorySuggestion[] = data.suggestions ?? [];
      setReviewItems(items);
      setCheckedNames(new Set(items.map((s) => s.name)));
      setStep('review');
    }
  }

  async function parseFile(base64: string, mimeType: string) {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'parse_packing_list',
        fileData: base64,
        mimeType,
        activityNames: activities.map((a) => a.name),
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setImportError("Couldn't parse the file. Try pasting the text instead.");
    } else {
      const items: InventorySuggestion[] = data.suggestions ?? [];
      setReviewItems(items);
      setCheckedNames(new Set(items.map((s) => s.name)));
      setStep('review');
    }
  }

  function openEdit(s: InventorySuggestion) {
    setEditingItem(s);
    setEditName(s.name);
    setEditCategory(s.category);
    setEditQty(s.quantityType);
  }

  function saveEdit() {
    if (!editingItem || !editName.trim()) return;
    const updated: InventorySuggestion = {
      ...editingItem,
      name: editName.trim(),
      category: editCategory,
      quantityType: editQty,
    };
    setReviewItems((prev) => prev.map((s) => (s.name === editingItem.name ? updated : s)));
    setCheckedNames((prev) => {
      const next = new Set(prev);
      next.delete(editingItem.name);
      next.add(updated.name);
      return next;
    });
    setEditingItem(null);
  }

  async function confirmItems() {
    setConfirming(true);
    const toInsert = reviewItems.filter((s) => checkedNames.has(s.name));

    for (const item of toInsert) {
      const { data: newItem, error } = await supabase
        .from('items')
        .insert({ name: item.name, category: item.category, quantity_type: item.quantityType, essential: false })
        .select('id')
        .single();

      if (!error && newItem) {
        const activityIds = resolveActivityIds(item.activities);
        if (activityIds.length > 0) {
          await supabase.from('item_activities').insert(
            activityIds.map((activity_id) => ({ item_id: newItem.id, activity_id }))
          );
        }
      }
    }

    await markOnboardingComplete();
    setConfirming(false);
    onComplete();
  }

  async function markOnboardingComplete() {
    if (prefsId) {
      await supabase.from('user_preferences').update({ onboarding_completed: true }).eq('id', prefsId);
    } else {
      await supabase.from('user_preferences').insert({ onboarding_completed: true });
    }
  }

  const checkedCount = reviewItems.filter((s) => checkedNames.has(s.name)).length;

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[85vh]">
        <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
          <div className="sheet-handle" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--zi-border)' }}>
          <h3 className="text-base font-semibold" style={{ color: 'var(--zi-text)' }}>
            {step === 'choose-path' && 'Build your stuff'}
            {step === 'import' && 'Import a list'}
            {step === 'review' && 'Review items'}
          </h3>
          <button onClick={onDismiss} className="text-sm font-medium" style={{ color: 'var(--zi-text-muted)' }}>
            Skip
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">
          {/* Choose path */}
          {step === 'choose-path' && (
            <>
              <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                Your stuff is the heart of Zip It — add some starter items to get going.
              </p>
              {aiError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{aiError}</p>}

              {aiLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-smart)' }} />
                  <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Thinking…</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleGenerateAI}
                    className="text-left p-4"
                    style={{ border: '1.5px solid var(--zi-smart-lo)', borderRadius: 'var(--zi-r-lg)', background: 'var(--zi-smart-tint)' }}
                  >
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--zi-smart-deep)' }}>
                      <span style={{ color: 'var(--zi-smart)', marginRight: 6 }}>✦</span>Generate with AI
                    </p>
                    <p className="text-xs" style={{ color: 'var(--zi-text-muted)' }}>
                      We&apos;ll use your travel style to suggest a starter list. Takes 10 seconds.
                    </p>
                  </button>

                  <button
                    onClick={() => setStep('import')}
                    className="text-left p-4"
                    style={{ border: '1.5px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                  >
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--zi-text)' }}>
                      Import a list
                    </p>
                    <p className="text-xs" style={{ color: 'var(--zi-text-muted)' }}>
                      Got a packing list somewhere? Upload a photo, PDF, or text file — or just paste it in.
                    </p>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Import */}
          {step === 'import' && (
            <>
              <button onClick={() => setStep('choose-path')} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
                ← Back
              </button>

              {/* Tabs */}
              <div className="flex" style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)', padding: 3 }}>
                {(['upload', 'paste'] as ImportTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setImportTab(tab)}
                    className="flex-1 py-1.5 text-sm font-medium capitalize"
                    style={{
                      borderRadius: 'calc(var(--zi-r-lg) - 3px)',
                      background: importTab === tab ? 'var(--zi-brand)' : 'transparent',
                      color: importTab === tab ? '#fff' : 'var(--zi-text-muted)',
                    }}
                  >
                    {tab === 'upload' ? 'Upload file' : 'Paste text'}
                  </button>
                ))}
              </div>

              {importTab === 'upload' && (
                <div className="flex flex-col gap-3">
                  <label
                    className="flex flex-col items-center justify-center gap-2 py-8 cursor-pointer"
                    style={{ border: '1.5px dashed var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                  >
                    <svg width="24" height="24" fill="none" stroke="var(--zi-text-subtle)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                      {selectedFile ? selectedFile.name : 'Tap to choose a file'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>Photo, PDF, or text file</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setImportError(''); }}
                    />
                  </label>
                  {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}
                  {importLoading ? (
                    <div className="flex items-center gap-2 justify-center py-4">
                      <SuitcaseIcon size={18} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
                      <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Parsing…</span>
                    </div>
                  ) : (
                    <PrimaryBtn onClick={handleParseFile} disabled={!selectedFile} full>
                      Parse list
                    </PrimaryBtn>
                  )}
                </div>
              )}

              {importTab === 'paste' && (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste your packing list here — any format works"
                    rows={6}
                    className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                    style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                  />
                  {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}
                  {importLoading ? (
                    <div className="flex items-center gap-2 justify-center py-4">
                      <SuitcaseIcon size={18} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
                      <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Parsing…</span>
                    </div>
                  ) : (
                    <PrimaryBtn onClick={handlePasteText} disabled={!pasteText.trim()} full>
                      Parse list
                    </PrimaryBtn>
                  )}
                </div>
              )}
            </>
          )}

          {/* Review */}
          {step === 'review' && (
            <>
              {editingItem ? (
                <div className="flex flex-col gap-4">
                  <button onClick={() => setEditingItem(null)} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
                    ← Back to items
                  </button>
                  <Input label="Name" value={editName} onChange={setEditName} />
                  <div>
                    <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Category</p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => (
                        <Chip key={cat} selected={editCategory === cat} onClick={() => setEditCategory(cat)}>{cat}</Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Quantity</p>
                    <div className="flex flex-col gap-2">
                      {QUANTITY_TYPES.map(({ value, label, description }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEditQty(value)}
                          className="flex items-start gap-3 px-3 py-3 text-left"
                          style={{
                            borderRadius: 'var(--zi-r-lg)',
                            border: `1px solid ${editQty === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                            background: editQty === value ? 'var(--zi-brand-tint)' : 'transparent',
                          }}
                        >
                          <div
                            className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                            style={{ borderColor: editQty === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}
                          >
                            {editQty === value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{label}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <PrimaryBtn onClick={saveEdit} disabled={!editName.trim()} full>Save</PrimaryBtn>
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>
                    Uncheck items you don&apos;t want. Tap a name to edit.
                  </p>

                  {CATEGORY_ORDER.map((cat) => {
                    const catItems = reviewItems.filter((s) => s.category === cat);
                    if (catItems.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div className="py-1.5" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--zi-text-subtle)' }}>{cat}</span>
                        </div>
                        {catItems.map((s) => {
                          const checked = checkedNames.has(s.name);
                          return (
                            <div key={s.name} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                              <button
                                onClick={() => setCheckedNames((prev) => {
                                  const next = new Set(prev);
                                  checked ? next.delete(s.name) : next.add(s.name);
                                  return next;
                                })}
                                className="mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                                style={{ border: `2px solid ${checked ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`, background: checked ? 'var(--zi-brand)' : 'white' }}
                              >
                                {checked && (
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <button onClick={() => openEdit(s)} className="text-left w-full">
                                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{s.name}</p>
                                </button>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  <span className="text-xs px-2 py-0.5" style={{ color: 'var(--zi-text-subtle)', background: 'var(--zi-border)', borderRadius: 'var(--zi-r-pill)' }}>
                                    {s.quantityType.replace('_', ' ')}
                                  </span>
                                  {s.activities.map((act) => (
                                    <span key={act} className="text-xs px-2 py-0.5" style={{ color: 'var(--zi-smart-deep)', background: 'var(--zi-smart-tint)', borderRadius: 'var(--zi-r-pill)' }}>
                                      {act}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <PrimaryBtn onClick={confirmItems} disabled={confirming || checkedCount === 0} full>
                    {confirming ? 'Adding…' : `Add ${checkedCount} item${checkedCount !== 1 ? 's' : ''} to My Stuff`}
                  </PrimaryBtn>
                  <SecondaryBtn onClick={onDismiss} full>Skip for now</SecondaryBtn>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URI prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
