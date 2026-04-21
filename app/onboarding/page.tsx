'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity, CategoryType, InventorySuggestion, QuantityType } from '@/types';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { PrimaryBtn, SecondaryBtn } from '@/components/ui/Button';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

const SLIDES = [
  {
    emoji: '⭐',
    heading: 'Essentials always pack',
    body: 'Items marked essential appear on every trip, no matter what. Think passport, charger, toothbrush.',
  },
  {
    emoji: '🏌️',
    heading: 'Activities drive the rest',
    body: "Tag items to activities like Golf or Beach. They'll only appear when that activity is on your trip.",
  },
  {
    emoji: '📅',
    heading: 'Duration scales quantities',
    body: "Set socks to 'per night' and we'll calculate exactly how many to pack. No more counting on your fingers.",
  },
  {
    emoji: '➕',
    heading: 'Add as you go',
    body: "Forget something? Add it directly from any packing list. We'll ask if you want it in your inventory for next time.",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'walkthrough' | 'about-me' | 'activities' | 'choose-path' | 'import' | 'review';
type ImportTab = 'upload' | 'paste';

// ── Main component (wrapped in Suspense for useSearchParams) ─────────────────

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRedo = searchParams.get('redo') === 'true';

  const supabase = createClient();

  // Step machine
  const [step, setStep] = useState<Step>('walkthrough');
  const [slideIndex, setSlideIndex] = useState(0);

  // Fetched on mount
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prefsId, setPrefsId] = useState<string | null>(null);
  const [aboutMe, setAboutMe] = useState('');
  const [initDone, setInitDone] = useState(false);

  // About me step
  const [aboutMeInput, setAboutMeInput] = useState('');

  // Activities step — names of activities the user selects
  const [selectedActivityNames, setSelectedActivityNames] = useState<string[]>([]);
  const [newActivityInput, setNewActivityInput] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);

  // AI generate
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Import
  const [importTab, setImportTab] = useState<ImportTab>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Review
  const [reviewItems, setReviewItems] = useState<InventorySuggestion[]>([]);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<InventorySuggestion | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryType>('Clothing');
  const [editQty, setEditQty] = useState<QuantityType>('fixed');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [actsResult, prefsResult] = await Promise.all([
        supabase.from('activities').select('*').order('name'),
        supabase.from('user_preferences').select('id, about_me, onboarding_completed').limit(1).maybeSingle(),
      ]);

      if (actsResult.data) setActivities(actsResult.data as Activity[]);

      if (prefsResult.data) {
        setPrefsId(prefsResult.data.id);
        const existing = prefsResult.data.about_me ?? '';
        setAboutMe(existing);
        setAboutMeInput(existing);

        // If already onboarded and not a redo, send them home
        if (prefsResult.data.onboarding_completed && !isRedo) {
          router.replace('/');
          return;
        }
      }

      setInitDone(true);
    }
    load();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function resolveActivityIds(names: string[]): string[] {
    return names
      .map((n) => activities.find((a) => a.name === n)?.id)
      .filter((id): id is string => !!id);
  }

  async function saveAboutMe(text: string) {
    const trimmed = text.trim() || null;
    if (prefsId) {
      await supabase.from('user_preferences').update({ about_me: trimmed }).eq('id', prefsId);
    }
    setAboutMe(trimmed ?? '');
  }

  async function addActivity() {
    const name = newActivityInput.trim();
    if (!name || activities.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    setAddingActivity(true);
    const { data, error } = await supabase
      .from('activities')
      .insert({ name, user_id: userId })
      .select('id, name, user_id, created_at')
      .single();
    if (!error && data) {
      setActivities((prev) => [...prev, data as Activity]);
      setSelectedActivityNames((prev) => [...prev, data.name]);
    }
    setNewActivityInput('');
    setAddingActivity(false);
  }

  async function markComplete() {
    if (prefsId) {
      await supabase.from('user_preferences').update({ onboarding_completed: true }).eq('id', prefsId);
    } else {
      await supabase.from('user_preferences').insert({ onboarding_completed: true });
    }
  }

  async function skip() {
    await markComplete();
    router.push('/inventory');
  }

  // ── AI generate ────────────────────────────────────────────────────────────

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
          activityNames: selectedActivityNames.length > 0
            ? selectedActivityNames
            : activities.map((a) => a.name),
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

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleParseFile() {
    if (!selectedFile) return;
    setImportLoading(true);
    setImportError('');
    try {
      const isText = selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.md');
      if (isText) {
        await parseContent({ text: await selectedFile.text() });
      } else {
        const base64 = await fileToBase64(selectedFile);
        await parseContent({ fileData: base64, mimeType: selectedFile.type || 'application/octet-stream' });
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
    await parseContent({ text: pasteText.trim() });
    setImportLoading(false);
  }

  async function parseContent(payload: { text?: string; fileData?: string; mimeType?: string }) {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'parse_packing_list',
        activityNames: selectedActivityNames.length > 0
          ? selectedActivityNames
          : activities.map((a) => a.name),
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setImportError("Couldn't parse the list. Try pasting the text instead.");
    } else {
      const items: InventorySuggestion[] = data.suggestions ?? [];
      setReviewItems(items);
      setCheckedNames(new Set(items.map((s) => s.name)));
      setStep('review');
    }
  }

  // ── Review ─────────────────────────────────────────────────────────────────

  function openEdit(s: InventorySuggestion) {
    setEditingItem(s);
    setEditName(s.name);
    setEditCategory(s.category);
    setEditQty(s.quantityType);
  }

  function saveEdit() {
    if (!editingItem || !editName.trim()) return;
    const updated: InventorySuggestion = { ...editingItem, name: editName.trim(), category: editCategory, quantityType: editQty };
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
        .insert({ name: item.name, category: item.category, quantity_type: item.quantityType, essential: false, user_id: userId })
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

    await markComplete();
    router.push('/inventory');
  }

  const checkedCount = reviewItems.filter((s) => checkedNames.has(s.name)).length;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!initDone) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <SuitcaseIcon size={32} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col bg-white">

      {/* ── Walkthrough ─────────────────────────────────────────────────────── */}
      {step === 'walkthrough' && (
        <div className="flex-1 flex flex-col">
          {/* Skip */}
          <div className="flex justify-end px-5 pt-5 pb-0">
            <button onClick={skip} className="text-sm font-medium" style={{ color: 'var(--zi-text-subtle)' }}>
              Skip
            </button>
          </div>

          {/* Slide content */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
            <div
              className="flex items-center justify-center"
              style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--zi-brand-tint)', fontSize: 40 }}
            >
              {SLIDES[slideIndex].emoji}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>
                {SLIDES[slideIndex].heading}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
                {SLIDES[slideIndex].body}
              </p>
            </div>
          </div>

          {/* Progress dots + navigation */}
          <div className="flex flex-col items-center gap-6 px-6 pb-10">
            <div className="flex gap-2">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === slideIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === slideIndex ? 'var(--zi-brand)' : 'var(--zi-border-strong)',
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => slideIndex > 0 && setSlideIndex(slideIndex - 1)}
                className="text-sm font-medium px-4 py-2"
                style={{ color: slideIndex > 0 ? 'var(--zi-brand)' : 'transparent' }}
              >
                Back
              </button>

              <PrimaryBtn
                onClick={() => {
                  if (slideIndex < SLIDES.length - 1) {
                    setSlideIndex(slideIndex + 1);
                  } else {
                    setStep('about-me');
                  }
                }}
              >
                {slideIndex === SLIDES.length - 1 ? 'Get started' : 'Next'}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── About Me ────────────────────────────────────────────────────────── */}
      {step === 'about-me' && (
        <div className="flex-1 flex flex-col px-6 pt-10 pb-10 gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>Tell us about yourself</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
              This helps Smart Suggestions give you a better starting inventory.
            </p>
          </div>

          <textarea
            value={aboutMeInput}
            onChange={(e) => setAboutMeInput(e.target.value)}
            placeholder="e.g. I travel mostly for work with the occasional golf weekend. I always forget a travel adapter and tend to overpack shoes."
            rows={5}
            className="w-full px-3 py-2.5 text-sm resize-none outline-none"
            style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
          />

          <div className="flex-1" />

          <div className="flex flex-col gap-3">
            <PrimaryBtn
              onClick={async () => {
                await saveAboutMe(aboutMeInput);
                setStep('activities');
              }}
              full
            >
              Next
            </PrimaryBtn>
            <button
              onClick={() => { setStep('activities'); }}
              className="text-sm font-medium py-2 text-center"
              style={{ color: 'var(--zi-text-subtle)' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Activities ──────────────────────────────────────────────────────── */}
      {step === 'activities' && (
        <div className="flex-1 flex flex-col px-6 pt-10 pb-10 gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>What do you pack for?</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
              Select the activities that apply to your trips. We&apos;ll use this to suggest the right items.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {activities.map((a) => {
              const selected = selectedActivityNames.includes(a.name);
              return (
                <Chip
                  key={a.id}
                  selected={selected}
                  onClick={() =>
                    setSelectedActivityNames((prev) =>
                      selected ? prev.filter((n) => n !== a.name) : [...prev, a.name]
                    )
                  }
                >
                  {a.name}
                </Chip>
              );
            })}
          </div>

          {/* Add custom activity */}
          <div className="flex gap-2">
            <input
              value={newActivityInput}
              onChange={(e) => setNewActivityInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addActivity()}
              placeholder="Add your own…"
              className="flex-1 px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
            />
            <button
              onClick={addActivity}
              disabled={!newActivityInput.trim() || addingActivity}
              className="px-4 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--zi-brand)', color: '#fff', borderRadius: 'var(--zi-r-lg)', border: 'none' }}
            >
              Add
            </button>
          </div>

          <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>
            You can manage activities any time from the <strong>My stuff</strong> tab.
          </p>

          <div className="flex-1" />

          <div className="flex flex-col gap-3">
            <PrimaryBtn onClick={() => setStep('choose-path')} full>
              Next
            </PrimaryBtn>
            <button
              onClick={() => setStep('choose-path')}
              className="text-sm font-medium py-2 text-center"
              style={{ color: 'var(--zi-text-subtle)' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Choose Path ─────────────────────────────────────────────────────── */}
      {step === 'choose-path' && (
        <div className="flex-1 flex flex-col px-6 pt-10 pb-10 gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>Build your inventory</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
              Choose how you&apos;d like to get started.
            </p>
          </div>

          {aiError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{aiError}</p>}

          {aiLoading ? (
            <div className="flex-1 flex items-center justify-center gap-3">
              <SuitcaseIcon size={24} className="luggage-spin-icon" style={{ color: 'var(--zi-smart)' }} />
              <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Generating suggestions…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleGenerateAI}
                className="text-left p-5"
                style={{ border: '1.5px solid var(--zi-smart-lo)', borderRadius: 'var(--zi-r-lg)', background: 'var(--zi-smart-tint)' }}
              >
                <p className="text-base font-semibold mb-1.5" style={{ color: 'var(--zi-smart-deep)' }}>
                  <span style={{ color: 'var(--zi-smart)', marginRight: 6 }}>✦</span>Generate with AI
                </p>
                <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                  We&apos;ll use your travel style to suggest a starter inventory. Takes 10 seconds.
                </p>
              </button>

              <button
                onClick={() => setStep('import')}
                className="text-left p-5"
                style={{ border: '1.5px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              >
                <p className="text-base font-semibold mb-1.5" style={{ color: 'var(--zi-text)' }}>
                  Import a list
                </p>
                <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                  Got a packing list somewhere? Upload a photo, PDF, or text file — or just paste it in.
                </p>
              </button>
            </div>
          )}

          <div className="flex-1" />

          <button onClick={skip} className="text-sm font-medium py-2 text-center" style={{ color: 'var(--zi-text-subtle)' }}>
            Skip for now
          </button>
        </div>
      )}

      {/* ── Import ──────────────────────────────────────────────────────────── */}
      {step === 'import' && (
        <div className="flex-1 flex flex-col px-6 pt-8 pb-10 gap-5">
          <button onClick={() => setStep('choose-path')} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
            ← Back
          </button>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>Import a list</h2>
            <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Any format works — we&apos;ll figure it out.</p>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)', padding: 3 }}>
            {(['upload', 'paste'] as ImportTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setImportTab(tab)}
                className="flex-1 py-2 text-sm font-medium"
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
            <div className="flex flex-col gap-4 flex-1">
              <label
                className="flex flex-col items-center justify-center gap-3 py-10 cursor-pointer"
                style={{ border: '1.5px dashed var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              >
                <svg width="28" height="28" fill="none" stroke="var(--zi-text-subtle)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>
                    {selectedFile ? selectedFile.name : 'Tap to choose a file'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Photo, PDF, or text file</p>
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setImportError(''); }}
                />
              </label>

              {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}

              <div className="flex-1" />

              {importLoading ? (
                <div className="flex items-center gap-2 justify-center py-4">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
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
            <div className="flex flex-col gap-4 flex-1">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste your packing list here — any format works"
                rows={8}
                className="w-full px-3 py-2.5 text-sm resize-none outline-none flex-1"
                style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              />
              {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}
              <div className="flex-1" />
              {importLoading ? (
                <div className="flex items-center gap-2 justify-center py-4">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
                  <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Parsing…</span>
                </div>
              ) : (
                <PrimaryBtn onClick={handlePasteText} disabled={!pasteText.trim()} full>
                  Parse list
                </PrimaryBtn>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Review ──────────────────────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--zi-border)' }}>
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-text)' }}>
              {editingItem ? 'Edit item' : 'Review items'}
            </h2>
            {!editingItem && (
              <button onClick={skip} className="text-sm font-medium" style={{ color: 'var(--zi-text-subtle)' }}>
                Skip
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
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
                              style={{
                                border: `2px solid ${checked ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                                background: checked ? 'var(--zi-brand)' : 'white',
                              }}
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
              </>
            )}
          </div>

          {/* Footer CTA */}
          {!editingItem && (
            <div className="px-6 py-5 flex flex-col gap-3" style={{ borderTop: '1px solid var(--zi-border)' }}>
              <PrimaryBtn onClick={confirmItems} disabled={confirming || checkedCount === 0} full>
                {confirming ? 'Adding…' : `Add ${checkedCount} item${checkedCount !== 1 ? 's' : ''} to inventory`}
              </PrimaryBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page export (Suspense required for useSearchParams) ───────────────────────

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data URI prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
